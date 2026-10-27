import { Suspense } from "react";
import RoomContent from "./RoomContent";

export default function RoomPage() {
  return (
    <Suspense fallback={<main>Loading room...</main>}>
      <RoomContent />
    </Suspense>
  );
}