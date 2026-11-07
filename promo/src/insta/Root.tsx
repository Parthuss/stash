import React from "react";
import { Composition, Still } from "remotion";
import { FridgePOV } from "./FridgePOV";
import { BookList } from "./BookList";
import { C3_1, C3_2, C3_3, C3_4, C3_5, C3_6, C3_7, C3_8 } from "./Carousels";

const SLIDES = [C3_1, C3_2, C3_3, C3_4, C3_5, C3_6, C3_7, C3_8];
export const InstaRoot: React.FC = () => (
  <>
    {SLIDES.map((S, i) => <Still key={i} id={`C3-${i + 1}`} component={S} width={1080} height={1350} />)}
    <Composition id="BookList" component={BookList} durationInFrames={950} fps={30} width={1080} height={1920} />
    <Composition id="FridgePOV" component={FridgePOV} durationInFrames={1035} fps={30} width={1080} height={1920} />
  </>
);
