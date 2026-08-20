import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { NotificationToast } from "./NotificationToast";
import { IMessageNotification } from "./IMessageNotification";
import { Background } from "./Background";
import { SectionLabel } from "./SectionLabel";
import { SectionHeadline } from "./SectionHeadline";

// The two alerts that actually land. First is the Shortcut's own copy,
// verbatim from shortcuts/Stash.cherri.template. Second is rebuilt from a
// real completion notification off this pipeline — full note metadata
// (title, topic · tools, source URL), which is the part worth showing.
export const ConfirmationScene: React.FC = () => {
  return (
    <Background>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "100%", padding: "0 56px", display: "flex", flexDirection: "column", gap: 14 }}>
          <SectionLabel text="AND IT TELLS YOU" />
          <SectionHeadline parts={["Queued.", "Then|#2F6FED", "done.|#2F6FED"]} size={48} />

          <div style={{ position: "relative", height: 300, marginTop: 22 }}>
            <NotificationToast
              title="Stash"
              body="Queued — you'll get a second alert when the note is ready"
              leaveAt={44}
              top={0}
            />
            <Sequence from={58}>
              <IMessageNotification leaveAt={80} top={0} />
            </Sequence>
          </div>
        </div>
      </AbsoluteFill>
    </Background>
  );
};
