import React from "react";
import { Composition } from "remotion";
import { RecipeDemo, DEMO_FRAMES } from "./RecipeDemo";

export const RecipesRoot: React.FC = () => (
  <Composition id="RecipeDemo" component={RecipeDemo} durationInFrames={DEMO_FRAMES} fps={30} width={1080} height={1920} />
);
