"use client";

import { useEffect } from "react";
import { registerSW } from "@/lib/push";

// 앱 설치·푸시 알림용 서비스 워커 등록(한 번)
export function SWRegister() {
  useEffect(() => { void registerSW(); }, []);
  return null;
}
