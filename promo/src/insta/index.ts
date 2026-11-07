// Separate entry for Instagram stills, so src/Root.tsx (the videos) stays untouched.
import { registerRoot } from "remotion";
import { InstaRoot } from "./Root";
registerRoot(InstaRoot);
