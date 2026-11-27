import React from "react";
import { ErrorScreen } from "@/components/ErrorScreen";

export default function PortalNotFound() {
  return <ErrorScreen code={404} />;
}
