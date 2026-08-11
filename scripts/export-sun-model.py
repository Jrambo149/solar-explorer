"""
Converts the Blender sun model into a glTF the app can load.

Run with:
    npm run model:sun

## Why a conversion step exists at all

three.js cannot read `.blend`. More importantly, glTF cannot carry Blender's
shader node graphs — it defines one PBR metallic-roughness material with image
textures, and that is all. This model's entire appearance is procedural: Noise
and Musgrave textures through ColorRamps into Blackbody and Emission, mixed by
Layer Weight fresnel against a Transparent BSDF. There is not a single image
texture in the file.

So exporting the materials is not merely lossy, it is meaningless — every part
would arrive as a flat grey PBR surface. **This script exports geometry only**,
and `src/scene/SunModel.jsx` rebuilds the look in three.js, where a fresnel rim
and additive emission are a few lines of shader rather than a thirty-node graph.

That split is the right one anyway. Layer Weight and the Geometry node's
incoming vector are *view-dependent*: they are what make the corona fade at the
limb and the prominences glow at grazing angles. A baked texture is by
definition view-independent and would throw that away. Recreating it live keeps
it.

## Normalisation

Everything is scaled so `Star_Surface` has radius 1. The app then draws the sun
at `warpSunRadius(scaleMode)` — the same "unit geometry scaled by a radius"
pattern the planets use, so the scale slider works on the model for free and no
magic constant has to be kept in sync with the .blend.

The Y-up conversion is glTF's own (Blender is Z-up), handled by the exporter.
"""

import bpy
import sys
from pathlib import Path
from mathutils import Matrix

_args = sys.argv[sys.argv.index("--") + 1 :]
OUT = Path(_args[0]).resolve()

# Which objects to write. Default is the whole render set; passing a list is how
# the app's actual asset is built — see PARTS_HELP below.
PARTS = _args[1].split(",") if len(_args) > 1 else None

# Whether to carry Blender's UV layout. Only the photosphere samples a map; the
# shells and loops are shaded procedurally and their coordinates are dead
# weight — 136 KB of it on the loops alone, which is a third of that file.
WITH_UV = "nouv" not in _args[2:]

PARTS_HELP = """
The app ships only the prominence loops, not the whole model.

Sorting what each part adds over the sun the app already draws: `Star_Surface`
is a sphere with a 2.5% noise displacement, against a sphere already wearing a
photographic map; `Corona` is a smooth shell at 1.23 radii, against a corona
sprite that is already tuned. Both are marginal. `Solar_Prominences` exports as
an empty shell because its scatter cannot be evaluated headlessly.

What is genuinely irreplaceable is the plasma loop geometry — arcs that no
sprite can imitate — and that is 2,746 vertices, about 90 KB. The full set is
1.15 MB, so better than nine tenths of the weight buys the two parts worth the
least. Hence `npm run model:sun` builds the loops alone; the full export is
still one argument away.
"""

# The mesh whose radius defines "1". Everything else keeps its true proportion
# to it — the corona really is ~1.25 radii, and that relationship is the model.
REFERENCE = "Star_Surface"


def bounding_radius(obj):
    """Farthest vertex from the object's origin, in world units."""
    matrix = obj.matrix_world
    return max((matrix @ v.co).length for v in obj.data.vertices)


"""
Subdivision levels to apply, per object.

The .blend ships these at render levels tuned for Cycles: `Star_Surface` at
level 5 evaluates to **507,906 vertices**, `Solar_Fire` at 4 to 126,978. That is
a two-thirds-of-a-million-vertex sun for a body a handful of pixels across at
overview zoom, and a 2.8 MB glTF even after coarsening to level 3.

Level 2 costs 1.1 MB and level 1 costs 736 KB, measured. 2 is the choice because
of what the subdivision is carrying: `Star_Surface` is displaced by only 0.05 of
its radius, a fine granulation that survives coarsening easily, but `Solar_Fire`
is displaced at *full* strength — it is the ragged outer flame shell, and at
level 1 its lumps turn into visible facets.
"""
SUBSURF_LEVELS = {
    "Star_Surface": 2,
    "Solar_Fire": 2,
    "Corona": 2,
}

# Geometry that the render never shows on its own: these are the source meshes
# the Solar_Prominences geometry-nodes graph scatters. They live in an unlinked
# collection, and the graph evaluates to zero geometry in background Blender, so
# the scatter cannot be baked here. They are exported individually instead and
# placed by the app, which wants control over them anyway — they need to move.
LOOSE_PARTS = ["Prominence_01", "Prominence_02", "Prominence_03", "Flare"]


def main():
    # Link every collection into the scene so the loose prominence meshes are
    # reachable; the .blend keeps them out of the view layer.
    scene = bpy.context.scene.collection
    linked = {c.name for c in scene.children_recursive}
    for collection in bpy.data.collections:
        if collection.name not in linked:
            try:
                scene.children.link(collection)
                print(f"[sun] linked collection {collection.name!r}")
            except RuntimeError as error:
                print(f"[sun] could not link {collection.name!r}: {error}")

    bpy.context.view_layer.update()

    for name, level in SUBSURF_LEVELS.items():
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        for modifier in obj.modifiers:
            if modifier.type == "SUBSURF":
                print(f"[sun] {name}: subsurf {modifier.render_levels} -> {level}")
                modifier.levels = level
                modifier.render_levels = level

    # The geometry-nodes scatter produces nothing outside the GUI, and an empty
    # mesh in the glTF is just a confusing node. Drop the modifier so the
    # object exports as its own base shell, which is a usable inner glow layer.
    prominences = bpy.data.objects.get("Solar_Prominences")
    if prominences:
        for modifier in list(prominences.modifiers):
            if modifier.type == "NODES":
                print("[sun] Solar_Prominences: dropping unevaluable GeometryNodes")
                prominences.modifiers.remove(modifier)

    reference = bpy.data.objects.get(REFERENCE)
    if reference is None:
        raise SystemExit(f"no object named {REFERENCE!r} in the .blend")

    # Measured before anything is filtered or scaled: the reference defines
    # "1 unit = one sun radius" even when it is not itself exported.
    radius = bounding_radius(reference)

    meshes = [o for o in bpy.context.view_layer.objects if o.type == "MESH"]
    if PARTS:
        missing = set(PARTS) - {o.name for o in meshes}
        if missing:
            raise SystemExit(f"no such object(s): {', '.join(sorted(missing))}")
        meshes = [o for o in meshes if o.name in PARTS]
    print(f"[sun] {REFERENCE} radius = {radius:.4f} Blender units -> normalising to 1.0")

    for obj in meshes:
        print(f"[sun]   {obj.name:22} {len(obj.data.vertices):5} verts")

    # Materials are dropped rather than exported. Leaving them on would ship a
    # set of grey PBR stand-ins that mean nothing and that the app immediately
    # replaces — dead weight in the file and a trap for anyone reading it later.
    for obj in meshes:
        obj.data.materials.clear()

    # Bake each object's world transform into its vertices, scale those, then
    # clear the transform. Flattening rather than scaling the objects avoids
    # the parenting trap: four of these meshes hang off "The Sun" empty and
    # four do not, so scaling every object would apply the empty's factor twice
    # to its children and leave the loose prominences the wrong size.
    scale = 1.0 / radius
    for obj in meshes:
        obj.data.transform(obj.matrix_world)
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        obj.data.transform(Matrix.Scale(scale, 4))

    bpy.context.view_layer.update()

    exported = {o.name for o in meshes}
    for obj in bpy.context.view_layer.objects:
        obj.select_set(obj.name in exported)

    OUT.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.export_scene.gltf(
        filepath=str(OUT),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="NONE",
        export_normals=True,
        # Carried only where something samples a map — see WITH_UV. The
        # photosphere needs them, and having Blender's own unwrap means it can
        # use a stock material rather than a hand-rolled equirectangular
        # sampler, which would need explicit derivatives to avoid a seam where
        # atan() wraps.
        export_texcoords=WITH_UV,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
    )

    size = OUT.stat().st_size
    print(f"[sun] wrote {OUT} ({size / 1024:.0f} KB)")


main()
