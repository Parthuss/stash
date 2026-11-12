// Separate entry for the recipe demo, so src/Root.tsx and src/insta/Root.tsx stay untouched.
import { registerRoot } from "remotion";
import { RecipesRoot } from "./Root";
registerRoot(RecipesRoot);
