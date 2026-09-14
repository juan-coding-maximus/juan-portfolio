import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/* A tank, three-quarters full, on the accent green. Opaque on purpose: iOS
   renders a transparent touch icon black. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2C6A46",
        }}
      >
        <div
          style={{
            width: 64,
            height: 116,
            borderRadius: 22,
            border: "6px solid #F7F6F1",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            overflow: "hidden",
          }}
        >
          <div style={{ width: "100%", height: 78, background: "#F7F6F1" }} />
        </div>
      </div>
    ),
    size,
  );
}
