/**
 * The visibility switches that decide which *classes* of body exist.
 *
 * ## Why this is a hook rather than `useStore((s) => s.layers)`
 *
 * Reading the whole `layers` object would re-render every consumer whenever any
 * layer changed — including Orbits, Trails, Labels and Icons, none of which
 * affect which bodies are in the scene. `Scene` rebuilds its entire body list on
 * that render, so toggling Labels would churn the whole scene graph for nothing.
 *
 * So each switch is subscribed to individually, as a primitive, and the object
 * is rebuilt only when one of *these* changes.
 *
 * ## Why it is shared rather than written out in each consumer
 *
 * Because it was written out in each consumer, and that is exactly how minor
 * moons shipped invisible. `Scene` and `LabelLayer` each built a literal
 * `{ dwarfPlanets, moons }` to hand to `bodyShown`. Adding the `minorMoons`
 * switch meant `bodyShown` started reading a key that those two literals did not
 * have — `undefined`, so falsy, so every minor moon was filtered out of the
 * scene and its labels while the nav bar, which passes the real `layers` object,
 * went on listing them. A control that appeared to do nothing.
 *
 * The failure mode is worth naming because it is silent and it recurs: any new
 * class of body adds a key here, and a consumer that has not been updated does
 * not error, it just quietly hides things.
 *
 * ## Why it no longer names the keys
 *
 * Because naming them did not work. This hook was written to fix exactly the bug
 * above, and then the comets shipped invisible in the same way — the switch went
 * on, `bodyShown` asked for `layers.comets`, and the object rebuilt here had
 * three hand-listed keys that did not include it.
 *
 * So it returns the **whole** `layers` object instead. There is nothing left to
 * forget: whatever `bodyShown` reads, it gets. The re-render economy that
 * motivated the hand-listing is kept by comparing only the class keys, so
 * toggling Orbits or Labels still does not churn the scene graph — the object
 * that comes back is the one from the store and only changes identity when a
 * class switch does.
 *
 * `CLASS_LAYERS` is the store's own list, so the comparison cannot drift from
 * the set of switches that actually govern bodies.
 */

import { useStoreWithEqualityFn } from 'zustand/traditional'
import { CLASS_LAYERS, useStore } from '../store/useStore'

const selectLayers = (s) => s.layers
const sameClasses = (a, b) => CLASS_LAYERS.every((key) => a[key] === b[key])

/*
 * `useStoreWithEqualityFn` rather than the store hook's own call signature:
 * zustand 5 dropped the equality argument from the React binding, and the hook
 * `create` returns doubles as the vanilla store this wants.
 */
export function useClassLayers() {
  return useStoreWithEqualityFn(useStore, selectLayers, sameClasses)
}
