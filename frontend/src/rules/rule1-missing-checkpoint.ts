import { toast } from "react-toastify";
import { calculateDistance } from "../utils/geo";

export function checkCheckpointAvoidanceRule({
  vehiclePasses,
  checkpoints,
  checkpointStartTimes,
  checkpointTimeout,
  cameraLocations,
  checkpointAlerts,
  setCheckpointAlerts,
  addNotification,
  now,
}: {
  vehiclePasses: any[];
  checkpoints: [number, number][];
  checkpointStartTimes: Map<string, number>;
  checkpointTimeout: number;
  cameraLocations: Record<number, [number, number]>;
  checkpointAlerts: Set<string>;
  setCheckpointAlerts: (s: Set<string>) => void;
  addNotification: (notif: any) => void;
  now: number;
}) {
  checkpoints.forEach((checkpoint) => {
    const checkpointKey = checkpoint.join(",");
    const allCameras = Object.entries(cameraLocations).map(([id, location]) => ({
      id: parseInt(id),
      location,
      distance: calculateDistance(checkpoint[0], checkpoint[1], location[0], location[1]),
    }));

    if (allCameras.length < 2) return;

    allCameras.sort((a, b) => a.distance - b.distance);
    const camA = allCameras[0];

    const vectorA = [camA.location[0] - checkpoint[0], camA.location[1] - checkpoint[1]];

    let bestCamB = null;
    let maxOppositeScore = -Infinity;

    for (let i = 1; i < allCameras.length; i++) {
      const candidateB = allCameras[i];
      const vectorB = [candidateB.location[0] - checkpoint[0], candidateB.location[1] - checkpoint[1]];

      const dotProduct = vectorA[0] * vectorB[0] + vectorA[1] * vectorB[1];
      const magnitudeA = Math.sqrt(vectorA[0] ** 2 + vectorA[1] ** 2);
      const magnitudeB = Math.sqrt(vectorB[0] ** 2 + vectorB[1] ** 2);
      
      if (magnitudeA === 0 || magnitudeB === 0) continue;

      const cosTheta = dotProduct / (magnitudeA * magnitudeB);
      
      // We want the angle to be as close to 180 degrees as possible (cosTheta close to -1)
      // A higher score means it's a better opposite candidate.
      // We also penalize cameras that are too far away.
      const score = -cosTheta / (candidateB.distance + 1); 

      if (score > maxOppositeScore) {
        maxOppositeScore = score;
        bestCamB = candidateB;
      }
    }

    if (!bestCamB) return;
    const camB = bestCamB;

    const relevantPasses = vehiclePasses.filter((pass) => {
      const startTime = checkpointStartTimes.get(checkpointKey) || 0;
      const passTime = new Date(pass.pass_time).getTime();
      return (pass.camera_id === camA.id || pass.camera_id === camB.id) && passTime >= startTime;
    });

    const groupedByVehicle = new Map<number, any[]>();
    relevantPasses.forEach((pass) => {
      if (!groupedByVehicle.has(pass.vehicle_id)) {
        groupedByVehicle.set(pass.vehicle_id, []);
      }
      groupedByVehicle.get(pass.vehicle_id)!.push(pass);
    });

    groupedByVehicle.forEach((passes, vehicleId) => {
      const checkpointNotifiedKey = `checkpoint_notified_${vehicleId}_${checkpointKey}`;
      const alertKey = `${vehicleId}:${checkpointKey}`;
      if (localStorage.getItem(checkpointNotifiedKey) || checkpointAlerts.has(alertKey)) return;

      const camAPass = passes.find((p) => p.camera_id === camA.id);
      const camBPass = passes.find((p) => p.camera_id === camB.id);

      if ((camAPass && !camBPass) || (camBPass && !camAPass)) {
        const basePass = camAPass || camBPass;
        const passTime = new Date(basePass.pass_time).getTime();
        const timeSince = now - passTime;

        if (timeSince > checkpointTimeout * 1000) {
          const message = `⚠️ รถทะเบียน ${basePass.license_plate} ผ่านกล้อง ${basePass.camera_id} แต่ไม่ผ่านจุดตรวจระหว่างกล้อง ${camA.id} และ ${camB.id} ภายใน ${checkpointTimeout} วินาที → อาจหลบด่าน`;

          toast.warn(message, {
            toastId: `checkpoint-${vehicleId}-${checkpointKey}`,
            position: "top-right",
          });

          addNotification({
            id: `checkpoint-${vehicleId}-${checkpointKey}-${Date.now()}`,
            message,
            timestamp: Date.now(),
            type: "checkpoint",
            read: false,
            vehicle_id: vehicleId,
          });

          localStorage.setItem(checkpointNotifiedKey, "true");
          setCheckpointAlerts(new Set([...checkpointAlerts, alertKey]));
        }
      }
    });
  });
}