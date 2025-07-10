// rules/blacklist.ts

import { toast } from "react-toastify";

export interface VehiclePass {
  id: number;
  vehicle_id: number;
  camera_id: number;
  license_plate: string;
  camera_name: string;
  camera_location: string;
  pass_time: string;
  is_blacklisted: boolean;
  blacklist_reason: string | null;
}

export interface Notification {
  id: string;
  message: string;
  timestamp: number;
  type: "blacklist";
  read: boolean;
  vehicle_id: number;
}

export function handleBlacklistNotification(pass: VehiclePass, notifiedPassIds: Set<number>, blacklistMap: Map<string, string>, addNotification: (notif: Notification) => void) {
  if (notifiedPassIds.has(pass.id)) return;

  notifiedPassIds.add(pass.id);

  const reason = pass.blacklist_reason || blacklistMap.get(pass.license_plate) || "ไม่ระบุ";
  const message = `🚨 รถทะเบียน ${pass.license_plate} อยู่ใน Blacklist! ผ่านกล้อง ${pass.camera_name} (${pass.camera_location})\nเหตุผล: ${reason}`;

  toast.error(message, {
    toastId: `blacklist-${pass.id}`,
    position: "top-right",
    autoClose: 5000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    theme: "colored",
  });

  const newNotification: Notification = {
    id: `blacklist-${pass.vehicle_id}-${Date.now()}`,
    message,
    timestamp: Date.now(),
    type: "blacklist",
    read: false,
    vehicle_id: pass.vehicle_id,
  };

  addNotification(newNotification);
}
