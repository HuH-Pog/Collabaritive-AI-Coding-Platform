import { Suspense } from "react";
import RoomContent from "./RoomContent";

export default function RoomPage() {
  return (
    <Suspense
      fallback={
        <div className="page-container">
          <main style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--text-muted)" }}>
            Loading workspace...
          </main>
        </div>
      }
    >
      <RoomContent />
    </Suspense>
  );
}
