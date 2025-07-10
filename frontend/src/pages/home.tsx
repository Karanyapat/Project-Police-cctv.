import { useRouter } from "next/router";
import { useEffect, useState, useCallback, useRef } from "react";
import Navbar from "../components/Navbar";
import dynamic from "next/dynamic";
import io from "socket.io-client";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Webcam from "react-webcam";
import { ComponentType } from "react";
import Head from 'next/head';
import { checkCheckpointAvoidanceRule, handleBlacklistNotification } from '../rules';
import cameraLocations from "../constants/cameraLocations";
import { calculateDistance } from "../utils/geo";

// กำหนด interface สำหรับ MapProps
interface MapProps {
  center: [number, number];
  cameras: Record<number, [number, number]>;
  carHistory: any[];
  showCarMarkers?: boolean;
  showRoute?: boolean;
  checkpoints: [number, number][];
  onCheckpointAdd: (position: [number, number]) => void;
  onCheckpointRemove: (position: [number, number]) => void;
}

// กำหนด interface สำหรับการแจ้งเตือน
interface Notification {
  id: string;
  message: string;
  timestamp: number;
  type: "blacklist" | "checkpoint";
  read: boolean;
  vehicle_id: number;
}

// กำหนด type สำหรับ MapWithNoSSR
const MapWithNoSSR = dynamic(() => import("../components/Map"), {
  ssr: false,
}) as ComponentType<MapProps>;

interface VehiclePass {
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

const socket = io(process.env.NEXT_PUBLIC_API_URL || "", {
  transports: ["websocket"],
});


export default function Home() {
  const router = useRouter();
  const [selectedCameras, setSelectedCameras] = useState<number[]>([]);
  const [checkpoints, setCheckpoints] = useState<[number, number][]>([]);
  const [checkpointStartTimes, setCheckpointStartTimes] = useState<Map<string, number>>(new Map());
  const [mapCenter, setMapCenter] = useState<[number, number]>([16.8631, 100.2159]);
  const [showPopup, setShowPopup] = useState(false);
  const [tempSelectedCameras, setTempSelectedCameras] = useState<number[]>([]);
  const [vehiclePasses, setVehiclePasses] = useState<VehiclePass[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notifiedVehicles, setNotifiedVehicles] = useState<Set<number>>(new Set());
  const [checkpointAlerts, setCheckpointAlerts] = useState<Set<string>>(new Set());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const webcamRefs = useRef<Record<number, Webcam | null>>({});
  const notificationCounter = useRef(0);
  const notifiedPassIds = useRef<Set<number>>(new Set());
  const [blacklistMap, setBlacklistMap] = useState<Map<string, string>>(new Map());
  const [showSimulatePopup, setShowSimulatePopup] = useState(false);
  const [vehiclesList, setVehiclesList] = useState<any[]>([]);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<number[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkpointTimeout, setCheckpointTimeout] = useState<number>(10);
  const [vehicleProfiles, setVehicleProfiles] = useState<any[]>([]);
  const [showVehicleProfilePopup, setShowVehicleProfilePopup] = useState(false);
  const [showAddProfilePopup, setShowAddProfilePopup] = useState(false);
  const [simulationStatus, setSimulationStatus] = useState<Record<string, string>>({});
  const [cameraPath, setCameraPath] = useState<number[]>([]);
  const [tick, setTick] = useState(0);
  const [passArrivalTimes, setPassArrivalTimes] = useState<Map<number, number>>(new Map());
  const [clockOffset, setClockOffset] = useState(0);

  useEffect(() => {
    const fetchServerTime = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/api/time`); 
        if (!res.ok) {
          console.error("Failed to fetch server time, status:", res.status);
          toast.error(`Error fetching server time: ${res.statusText}`);
          return;
        }
        const data = await res.json();
        if (data && data.status === 'ok' && typeof data.time === 'number') {
          setClockOffset(data.time - Date.now());
        } else {
          console.error("Invalid time data received from server:", data);
        }
      } catch (err) {
        console.error("Error fetching server time:", err);
        toast.error("An error occurred while syncing time with the server.");
      }
    };

    // Fetch time immediately on mount
    fetchServerTime();

    // Fetch time every 60 seconds
    const intervalId = setInterval(fetchServerTime, 60 * 1000); // Sync every 60 seconds

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const fetchBlacklist = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/blacklist`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.status === "ok") {
          const map = new Map<string, string>();
          json.blacklist.forEach((item: any) => {
            map.set(item.license_plate, item.reason);
          });
          setBlacklistMap(map);
        }
      } catch (err) {
        console.error("ไม่สามารถดึงข้อมูล blacklist:", err);
      }
    };

    fetchBlacklist();
  }, []);

  const loadSavedData = useCallback(() => {
    try {
      const savedCameras = localStorage.getItem("selectedCameras");
      if (savedCameras) {
        const parsedCameras = JSON.parse(savedCameras);
        if (Array.isArray(parsedCameras)) {
          setSelectedCameras(parsedCameras);
        }
      }

      const savedCheckpoints = localStorage.getItem("checkpoints");
      if (savedCheckpoints) {
        const parsedCheckpoints = JSON.parse(savedCheckpoints);
        if (Array.isArray(parsedCheckpoints)) {
          setCheckpoints(parsedCheckpoints);
        } else {
          setCheckpoints([]);
          localStorage.setItem("checkpoints", JSON.stringify([]));
        }
      } else {
        setCheckpoints([]);
        localStorage.setItem("checkpoints", JSON.stringify([]));
      }

      const savedCheckpointStartTimes = localStorage.getItem("checkpointStartTimes");
      if (savedCheckpointStartTimes) {
        const parsedTimes = JSON.parse(savedCheckpointStartTimes);
        const newMap = new Map<string, number>();
        Object.entries(parsedTimes).forEach(([key, value]) => {
          newMap.set(key, Number(value));
        });
        setCheckpointStartTimes(newMap);
      } else {
        setCheckpointStartTimes(new Map());
        localStorage.setItem("checkpointStartTimes", JSON.stringify({}));
      }

      const savedNotifications = localStorage.getItem("notifications");
      if (savedNotifications) {
        const parsedNotifications = JSON.parse(savedNotifications);
        if (Array.isArray(parsedNotifications)) {
          setNotifications(parsedNotifications);
          setUnreadCount(parsedNotifications.filter((notif: Notification) => !notif.read).length);
        } else {
          setNotifications([]);
          setUnreadCount(0);
          localStorage.setItem("notifications", JSON.stringify([]));
        }
      } else {
        setNotifications([]);
        setUnreadCount(0);
        localStorage.setItem("notifications", JSON.stringify([]));
      }

      const savedTimeout = localStorage.getItem("checkpointTimeout");
      if (savedTimeout) {
        const parsedTimeout = Number(savedTimeout);
        if ([10, 30, 60].includes(parsedTimeout)) {
          setCheckpointTimeout(parsedTimeout);
        } else {
          setCheckpointTimeout(10);
          localStorage.setItem("checkpointTimeout", "10");
        }
      } else {
        setCheckpointTimeout(10);
        localStorage.setItem("checkpointTimeout", "10");
      }

      const loadedCheckpointAlerts = new Set<string>();
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("checkpoint_notified_")) {
          loadedCheckpointAlerts.add(key.replace("checkpoint_notified_", ""));
        }
      }
      setCheckpointAlerts(loadedCheckpointAlerts);

      const loadedNotifiedVehicles = new Set<number>();
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("notified_")) {
          const id = parseInt(key.replace("notified_", ""), 10);
          if (!isNaN(id)) loadedNotifiedVehicles.add(id);
        }
      }
      setNotifiedVehicles(loadedNotifiedVehicles);

      const savedProfiles = localStorage.getItem("vehicleProfiles");
      if (savedProfiles) {
        try {
          const parsedProfiles = JSON.parse(savedProfiles);
          if (Array.isArray(parsedProfiles)) {
            setVehicleProfiles(parsedProfiles);
          }
        } catch (err) {
          console.error("ไม่สามารถแปลง vehicleProfiles:", err);
        }
      }
    } catch (error) {
      console.error("ไม่สามารถโหลดข้อมูลจาก localStorage:", error);
      setCheckpoints([]);
      setCheckpointStartTimes(new Map());
      setSelectedCameras([]);
      setNotifications([]);
      setUnreadCount(0);
      setCheckpointTimeout(10);
      setCheckpointAlerts(new Set());
      try {
        localStorage.removeItem("checkpoints");
        localStorage.removeItem("checkpointStartTimes");
        localStorage.removeItem("selectedCameras");
        localStorage.removeItem("notifications");
        localStorage.removeItem("checkpointTimeout");
      } catch (innerError) {
        console.error("ไม่สามารถล้าง localStorage:", innerError);
      }
    }
  }, []);

  useEffect(() => {
    const user = localStorage.getItem("@user");
    const token = localStorage.getItem("token");
    if (!user || !token) {
      router.push("/login");
      return;
    }

    loadSavedData();
  }, [router, loadSavedData]);

  useEffect(() => {
    const handleRouteChange = () => {
      const user = localStorage.getItem("@user");
      const token = localStorage.getItem("token");
      if (!user || !token) {
        router.push("/login");
        return;
      }
      loadSavedData();
    };

    router.events.on("routeChangeComplete", handleRouteChange);

    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router, loadSavedData]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        localStorage.setItem("checkpoints", JSON.stringify(checkpoints));
        const checkpointStartTimesObj = Object.fromEntries(checkpointStartTimes);
        localStorage.setItem("checkpointStartTimes", JSON.stringify(checkpointStartTimesObj));
        localStorage.setItem("selectedCameras", JSON.stringify(selectedCameras));
        localStorage.setItem("notifications", JSON.stringify(notifications));
        localStorage.setItem("checkpointTimeout", checkpointTimeout.toString());
      } catch (error) {
        console.error("ไม่สามารถบันทึกสถานะก่อนปิดหน้า:", error);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [checkpoints, checkpointStartTimes, selectedCameras, notifications, checkpointTimeout]);

  useEffect(() => {
    try {
      localStorage.setItem("vehicleProfiles", JSON.stringify(vehicleProfiles));
    } catch (error) {
      console.error("ไม่สามารถบันทึก vehicleProfiles:", error);
      toast.error("บันทึกโปรไฟล์รถไม่สำเร็จ (Storage เต็ม)");
    }
  }, [vehicleProfiles]);

  const notifyBlacklist = (pass: VehiclePass) => {
    handleBlacklistNotification(pass, notifiedPassIds.current, blacklistMap, (notif) => {
      setNotifications((prev) => {
        const updated = [notif, ...prev];
        localStorage.setItem("notifications", JSON.stringify(updated));
        setUnreadCount(updated.filter((n) => !n.read).length);
        return updated;
      });
    });
  };

  const openSimulatePopup = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      toast.error("กรุณาเข้าสู่ระบบ");
      return;
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/vehicles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok) {
        setVehiclesList(json.vehicles);
        setSelectedVehicleIds([]);
        setSelectedCameraId(selectedCameras[0] || null);
        setShowSimulatePopup(true);
      } else {
        toast.error("โหลดรายการรถไม่สำเร็จ");
      }
    } catch (err) {
      console.error(err);
      toast.error("เกิดข้อผิดพลาดขณะโหลดรถ");
    }
  };

  const fetchVehiclePasses = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("ไม่พบ token กรุณาเข้าสู่ระบบใหม่");
      router.push("/login");
      return;
    }

    setLoading(true);

    try {
      const promises = selectedCameras.map((camera) =>
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/vehicle-pass/${camera}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((res) => {
          if (res.status === 403 || res.status === 401) throw new Error("ไม่ได้รับอนุญาต กรุณาเข้าสู่ระบบใหม่");
          return res.json();
        })
      );
      const results = await Promise.all(promises);
      const passes = results
        .flatMap((result) => result.data || [])
        .filter((pass) => selectedCameras.includes(pass.camera_id))
        .sort((a, b) => new Date(b.pass_time).getTime() - new Date(a.pass_time).getTime());

      setVehiclePasses((prev) => {
        const updatedPasses = [...prev];
        passes.forEach((newPass) => {
          const index = updatedPasses.findIndex((p) => p.id === newPass.id);
          if (index === -1) updatedPasses.push(newPass);
          else updatedPasses[index] = newPass;
        });
        return updatedPasses.sort((a, b) => new Date(b.pass_time).getTime() - new Date(a.pass_time).getTime());
      });

      setError(null);
    } catch (error: any) {
      setError(error.message);
      if (error.message.includes("ไม่ได้รับอนุญาต")) {
        localStorage.removeItem("token");
        localStorage.removeItem("@user");
        router.push("/login");
      }
    } finally {
      setLoading(false);
    }
  }, [selectedCameras, router]);

  const checkCheckpointAvoidance = useCallback(() => {
    checkCheckpointAvoidanceRule({
      vehiclePasses,
      checkpoints,
      checkpointStartTimes,
      checkpointTimeout,
      cameraLocations,
      checkpointAlerts,
      setCheckpointAlerts: setCheckpointAlerts as (s: Set<string>) => void,
      addNotification: (notif) => {
        setNotifications((prev) => {
          const updated = [notif, ...prev];
          localStorage.setItem("notifications", JSON.stringify(updated));
          setUnreadCount(updated.filter((n) => !n.read).length);
          return updated;
        });
      },
      now: Date.now() + clockOffset,
    });
  }, [
    vehiclePasses,
    checkpoints,
    checkpointStartTimes,
    checkpointTimeout,
    cameraLocations,
    checkpointAlerts,
    setCheckpointAlerts,
    clockOffset,
  ]);

  const clearAllNotifications = () => {
    setNotifications([]);
    setUnreadCount(0);
    try {
      localStorage.removeItem("notifications");
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith("notified_")) {
          localStorage.removeItem(key);
        }
      }
      setNotifiedVehicles(new Set());
      toast.success("ล้างการแจ้งเตือนทั้งหมดเรียบร้อย");
    } catch (error) {
      console.error("ไม่สามารถล้าง notifications จาก localStorage:", error);
      toast.error("ล้างการแจ้งเตือนไม่สำเร็จ");
    }
  };

  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      let updatedNotifications: Notification[] = [];

      setNotifications((prev) => {
        updatedNotifications = prev.filter(
          (notif) => now - notif.timestamp < 24 * 60 * 60 * 1000
        );
        try {
          localStorage.setItem("notifications", JSON.stringify(updatedNotifications));
        } catch (error) {
          console.error("ไม่สามารถบันทึก notifications ระหว่างการล้าง:", error);
        }
        setUnreadCount(updatedNotifications.filter((notif) => !notif.read).length);
        return updatedNotifications;
      });
    }, 60 * 60 * 1000);

    return () => clearInterval(cleanupInterval);
  }, []);

  useEffect(() => {
    if (selectedCameras.length > 0) {
      fetchVehiclePasses();
      selectedCameras.forEach((camera) => socket.emit("subscribe_cctv", camera));
    } else {
      setVehiclePasses([]);
      setNotifiedVehicles(new Set());
      setCheckpointAlerts(new Set());
    }

    return () => {
      socket.off("cctv_updated");
    };
  }, [selectedCameras, fetchVehiclePasses]);

  useEffect(() => {
    const handleVehiclePassUpdated = (newPass: VehiclePass | VehiclePass[]) => {
      const toNotify: VehiclePass[] = [];

      if (Array.isArray(newPass)) {
        setVehiclePasses((prev) => {
          const updatedPasses = [...prev];
          newPass.forEach((pass) => {
            if (selectedCameras.includes(pass.camera_id)) {
              const index = updatedPasses.findIndex((p) => p.id === pass.id);
              if (index === -1) {
                updatedPasses.push(pass);
                setPassArrivalTimes(prevTimes => new Map(prevTimes).set(pass.id, Date.now() + clockOffset));
              } else { 
                updatedPasses[index] = pass;
              }

              if (pass.is_blacklisted && !notifiedPassIds.current.has(pass.id)) {
                toNotify.push(pass);
              }
            }
          });
          return updatedPasses.sort((a, b) => new Date(b.pass_time).getTime() - new Date(a.pass_time).getTime());
        });
      } else {
        if (selectedCameras.includes(newPass.camera_id)) {
          setVehiclePasses((prev) => {
            const updatedPasses = [...prev];
            const index = updatedPasses.findIndex((p) => p.id === newPass.id);
            if (index === -1) {
              updatedPasses.unshift(newPass);
              setPassArrivalTimes(prevTimes => new Map(prevTimes).set(newPass.id, Date.now() + clockOffset));
            } else { 
              updatedPasses[index] = newPass;
            }
            return updatedPasses;
          });

          if (newPass.is_blacklisted && !notifiedPassIds.current.has(newPass.id)) {
            toNotify.push(newPass);
          }
        }
      }

      toNotify.forEach((pass) => notifyBlacklist(pass));
    };

    socket.on("cctv_updated", handleVehiclePassUpdated);

    return () => {
      socket.off("cctv_updated", handleVehiclePassUpdated);
    };
  }, [selectedCameras]);

  useEffect(() => {
    const interval = setInterval(() => {
      checkCheckpointAvoidance();
    }, 5 * 1000);
    return () => clearInterval(interval);
  }, [checkCheckpointAvoidance]);

  const addMultipleCameras = (cameraNumbers: number[]) => {
    const newSet = new Set([...selectedCameras, ...cameraNumbers]);
    const updatedCameras = Array.from(newSet);
    setSelectedCameras(updatedCameras);
    try {
      localStorage.setItem("selectedCameras", JSON.stringify(updatedCameras));
    } catch (error) {
      console.error("ไม่สามารถบันทึก selectedCameras ลง localStorage:", error);
    }
    setShowPopup(false);
    setTempSelectedCameras([]);
  };

  const removeCamera = (cameraNumber: number) => {
    const updatedCameras = selectedCameras.filter((c) => c !== cameraNumber);
    setSelectedCameras(updatedCameras);
    try {
      localStorage.setItem("selectedCameras", JSON.stringify(updatedCameras));
    } catch (error) {
      console.error("ไม่สามารถบันทึก selectedCameras ลง localStorage:", error);
    }
    setVehiclePasses((prev) => prev.filter((pass) => pass.camera_id !== cameraNumber));
    setNotifiedVehicles((prev) => {
      const newSet = new Set(prev);
      vehiclePasses.forEach((pass) => {
        if (pass.camera_id === cameraNumber) newSet.delete(pass.id);
      });
      return newSet;
    });
  };

  useEffect(() => {
    const fetchVehicles = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/vehicles`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (res.ok) {
          setVehiclesList(json.vehicles);
        } else {
          console.error("❌ โหลดรถไม่สำเร็จ:", json);
        }
      } catch (err) {
        console.error("❌ เกิดข้อผิดพลาดในการโหลดรถ:", err);
      }
    };

    fetchVehicles();
  }, []);

  const runSimulationFromProfiles = async (profiles = vehicleProfiles) => {
    const token = localStorage.getItem("token");
    if (!profiles || profiles.length === 0) {
      toast.error("ไม่มีโปรไฟล์ให้จำลอง 🚫");
      return;
    }
    if (!token) {
      toast.error("ไม่พบ token");
      return;
    }

    for (const profile of profiles) {
      const { license_plate, speed, start_time, camera_path } = profile;

      const vehicle = vehiclesList.find((v) => v.license_plate === license_plate);
      if (!vehicle) {
        toast.error(`ไม่พบรถทะเบียน ${license_plate}`);
        continue;
      }

      const vehicle_id = vehicle.id;
      const profileKey = `${vehicle_id}_${start_time}`;

      setSimulationStatus((prev) => ({
        ...prev,
        [profileKey]: "กำลังจำลอง...",
      }));

      const speed_mps = (speed * 1000) / 3600;
      const startTimestamp = Date.now() + clockOffset;

      let cumulativeTime = 0;

      for (let i = 0; i < camera_path.length; i++) {
        const camera_id = camera_path[i];

        let distance = 0;
        if (i > 0) {
          const prevCamera = cameraLocations[camera_path[i - 1]];
          const currentCamera = cameraLocations[camera_id];
          if (prevCamera && currentCamera) {
            distance = calculateDistance(
              prevCamera[0],
              prevCamera[1],
              currentCamera[0],
              currentCamera[1]
            );
          } else {
            console.warn(`ไม่พบพิกัดสำหรับกล้อง ${camera_path[i - 1]} หรือ ${camera_id}`);
            continue;
          }
        }

        const travelTimeSeconds = distance / speed_mps;
        cumulativeTime += travelTimeSeconds * 1000;

        const scheduledTime = startTimestamp + cumulativeTime;
        const waitTime = Math.max(scheduledTime - (Date.now() + clockOffset), 0);

        setTimeout(async () => {
          try {
            await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/vehicle-pass`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ vehicle_id, camera_id }),
            });
          } catch (err) {
            console.error(`❌ ยิงข้อมูลล้มเหลวสำหรับกล้อง ${camera_id}`, err);
          }

          if (i === camera_path.length - 1) {
            setSimulationStatus((prev) => ({
              ...prev,
              [profileKey]: "จำลองเสร็จแล้ว",
            }));
          }
        }, waitTime + 500);
      }
    }

    toast.success("เริ่มการจำลองเรียบร้อย 🚗💨");
  };

  const handleCameraClick = (cameraNumber: number) => {
    const newCenter = cameraLocations[cameraNumber];
    if (newCenter) {
      setMapCenter(newCenter);
      document.getElementById("map-section")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleCarClick = (plate: string) => {
    const pass = vehiclePasses.find((p) => p.license_plate === plate);
    if (pass) {
      router.push(
        `/route-history?vehicle_id=${pass.vehicle_id}&is_blacklisted=${pass.is_blacklisted}&blacklist_reason=${encodeURIComponent(
          pass.blacklist_reason || ""
        )}`
      );
    }
  };

  const toggleCameraInTemp = (cam: number) => {
    setTempSelectedCameras((prev) =>
      prev.includes(cam) ? prev.filter((c) => c !== cam) : [...prev, cam]
    );
  };

  const openCameraPopup = () => {
    setShowPopup(true);
    setTempSelectedCameras([]);
  };

  const handleCheckpointAdd = (position: [number, number]) => {
    setCheckpoints((prev) => {
      const updated = [...prev, position];
      try {
        localStorage.setItem("checkpoints", JSON.stringify(updated));
      } catch (error) {
        console.error("ไม่สามารถบันทึก checkpoints ลง localStorage:", error);
      }
      return updated;
    });
    setCheckpointStartTimes((prev) => {
      const newMap = new Map(prev);
      newMap.set(position.join(","), Date.now() + clockOffset);
      try {
        const checkpointStartTimesObj = Object.fromEntries(newMap);
        localStorage.setItem("checkpointStartTimes", JSON.stringify(checkpointStartTimesObj));
      } catch (error) {
        console.error("ไม่สามารถบันทึก checkpointStartTimes ลง localStorage:", error);
      }
      return newMap;
    });
  };

  const handleCheckpointRemove = (position: [number, number]) => {
    const checkpointKey = position.join(",");
    setCheckpoints((prev) => {
      const updated = prev.filter((p) => p[0] !== position[0] || p[1] !== position[1]);
      try {
        localStorage.setItem("checkpoints", JSON.stringify(updated));
      } catch (error) {
        console.error("ไม่สามารถบันทึก checkpoints ลง localStorage:", error);
      }
      return updated;
    });
    setCheckpointStartTimes((prev) => {
      const newMap = new Map(prev);
      newMap.delete(checkpointKey);
      try {
        const checkpointStartTimesObj = Object.fromEntries(newMap);
        localStorage.setItem("checkpointStartTimes", JSON.stringify(checkpointStartTimesObj));
      } catch (error) {
        console.error("ไม่สามารถบันทึก checkpointStartTimes ลง localStorage:", error);
      }
      return newMap;
    });
    setCheckpointAlerts((prev) => {
      const updated = new Set([...prev].filter((key) => !key.endsWith(checkpointKey)));
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith("checkpoint_notified_") && key.includes(checkpointKey)) {
            localStorage.removeItem(key);
          }
        }
      } catch (error) {
        console.error("ไม่สามารถล้าง checkpoint_notified keys จาก localStorage:", error);
      }
      return updated;
    });
  };

  const clearAllCheckpoints = () => {
    setCheckpoints([]);
    setCheckpointStartTimes(new Map());
    setCheckpointAlerts(new Set());
    try {
      localStorage.removeItem("checkpoints");
      localStorage.removeItem("checkpointStartTimes");
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith("checkpoint_notified_")) {
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.error("ไม่สามารถล้างข้อมูลจาก localStorage:", error);
    }
  };

  useEffect(() => {
  }, [checkpoints]);

  const handleTimeoutChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTimeout = Number(e.target.value);
    if ([10, 30, 60].includes(newTimeout)) {
      setCheckpointTimeout(newTimeout);
      try {
        localStorage.setItem("checkpointTimeout", newTimeout.toString());
      } catch (error) {
        console.error("ไม่สามารถบันทึก checkpointTimeout ลง localStorage:", error);
        toast.error("บันทึกช่วงเวลาไม่สำเร็จ (Storage เต็ม)");
      }
    } else {
      toast.error("กรุณาเลือกช่วงเวลา 10, 30, หรือ 60 วินาที");
    }
  };

  const removeProfile = (index: number) => {
    setVehicleProfiles((prev) => {
      const updated = [...prev];
      const removed = updated.splice(index, 1)[0];

      const removedVehicle = vehiclesList.find(v => v.license_plate === removed.license_plate);
      if (removedVehicle) {
        setSimulationStatus((prev) => {
          const copy = { ...prev };
          delete copy[removedVehicle.id];
          return copy;
        });
      }

      return updated;
    });

    toast.success("ลบโปรไฟล์เรียบร้อย");
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <Head>
        <title>CCTV</title>
        <link rel="icon" href="/police-logo.png" />
      </Head>
      <Navbar />
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="colored"
      />
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-7xl mx-auto relative">
          <div className="fixed top-20 right-6 z-50">
            <button
              onClick={() => {
                setShowNotificationPanel(!showNotificationPanel);
                if (!showNotificationPanel) {
                  setNotifications((prev) => {
                    const updated = prev.map((notif) => ({ ...notif, read: true }));
                    try {
                      localStorage.setItem("notifications", JSON.stringify(updated));
                    } catch (error) {
                      console.error("ไม่สามารถบันทึก notifications:", error);
                      toast.error("บันทึกแจ้งเตือนไม่สำเร็จ (Storage เต็ม)");
                    }
                    setUnreadCount(0);
                    return updated;
                  });
                }
              }}
              className="relative bg-white p-3 rounded-full shadow-lg hover:bg-gray-100 transition-colors duration-200"
            >
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          {showNotificationPanel && (
            <div className="fixed top-32 right-6 w-96 bg-white rounded-lg shadow-xl z-50 max-h-[70vh] overflow-y-auto">
              <div className="p-4 border-b flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-800">การแจ้งเตือน</h3>
                {notifications.length > 0 && (
                  <button
                    onClick={clearAllNotifications}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    ล้างทั้งหมด
                  </button>
                )}
              </div>
              <div className="p-4">
                {notifications.length === 0 ? (
                  <p className="text-gray-500 text-center">ไม่มีการแจ้งเตือน</p>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`p-3 mb-2 rounded-lg ${notif.type === "blacklist" ? "bg-red-50" : "bg-yellow-50"}`}
                    >
                      <p className="text-sm text-gray-700">{notif.message}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(notif.timestamp).toLocaleString("th-TH")}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded-lg mb-6 shadow-md">
              <p className="font-semibold">{error}</p>
            </div>
          )}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-gray-800">
              แดชบอร์ดตรวจสอบกล้อง
            </h1>
            <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-2 sm:space-y-0 w-full sm:w-auto">
              <button
                onClick={openSimulatePopup}
                className="w-full sm:w-auto px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors duration-200 shadow"
              >
                จำลองการตรวจจับรถ (ทดสอบ API)
              </button>
              <button
                onClick={() => setShowVehicleProfilePopup(true)}
                className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded"
              >
                จัดการโปรไฟล์รถ
              </button>
            </div>
          </div>

          <div className="bg-white shadow-lg rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">ฟีดกล้อง</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {selectedCameras.map((camera) => (
                <div
                  key={camera}
                  onClick={() => handleCameraClick(camera)}
                  className="relative bg-gray-200 rounded-lg overflow-hidden cursor-pointer group hover:shadow-xl transition-shadow duration-300"
                >
                  <Webcam
                    audio={false}
                    ref={(node) => {
                      webcamRefs.current[camera] = node;
                    }}
                    width="100%"
                    height="100%"
                    className="object-cover"
                    videoConstraints={{ facingMode: "environment" }}
                  />
                  <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                    กล้อง {camera}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCamera(camera);
                    }}
                    className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:bg-red-600 w-8 h-8 flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
              {selectedCameras.length < 20 && (
                <div
                  onClick={openCameraPopup}
                  className="border-2 border-dashed border-gray-300 rounded-lg bg-white flex items-center justify-center cursor-pointer hover:border-blue-500 transition-colors duration-300"
                >
                  <div className="w-16 h-16 flex items-center justify-center text-blue-500">
                    <span className="text-4xl font-bold">+</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white shadow-lg rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">ข้อมูลยานพาหนะ</h2>
            {loading && (
              <div className="text-center text-gray-500 py-4">
                กำลังโหลดข้อมูลจากกล้อง...
              </div>
            )}
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="min-w-[900px] w-full text-sm text-left text-gray-700">
                <thead className="bg-gray-50 text-xs uppercase sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-4 border-b">ไอดี</th>
                    <th className="py-3 px-4 border-b">ทะเบียนรถ</th>
                    <th className="py-3 px-4 border-b">กล้อง</th>
                    <th className="py-3 px-4 border-b">ตำแหน่ง</th>
                    <th className="py-3 px-4 border-b">เวลา</th>
                    <th className="py-3 px-4 border-b">เวลาคงเหลือ (วินาที)</th>
                  </tr>
                </thead>
                <tbody>
                  {vehiclePasses.map((pass) => {
                    const isBlacklisted = pass.is_blacklisted || blacklistMap.has(pass.license_plate);
                    const reason = pass.blacklist_reason || blacklistMap.get(pass.license_plate);

                    let timeRemaining = "-";
                    const passTime = new Date(pass.pass_time).getTime();
                    const arrivalTime = passArrivalTimes.get(pass.id);

                    if (checkpoints.length > 0 && passTime > 0) {
                      // Find the closest checkpoint to this vehicle pass
                      let closestCheckpoint: [number, number] | null = null;
                      let minDistance = Infinity;

                      checkpoints.forEach(cp => {
                        const passLocation = cameraLocations[pass.camera_id];
                        if(passLocation) {
                          const distance = calculateDistance(cp[0], cp[1], passLocation[0], passLocation[1]);
                          if (distance < minDistance) {
                            minDistance = distance;
                            closestCheckpoint = cp;
                          }
                        }
                      });

                      if (closestCheckpoint) {
                        const allCameras = Object.entries(cameraLocations).map(([id, location]) => ({
                          id: parseInt(id),
                          location,
                          distance: calculateDistance(closestCheckpoint![0], closestCheckpoint![1], location[0], location[1]),
                        }));

                        if (allCameras.length >= 2) {
                          allCameras.sort((a, b) => a.distance - b.distance);
                          const camA = allCameras[0];
                          const vectorA = [camA.location[0] - closestCheckpoint[0], camA.location[1] - closestCheckpoint[1]];

                          let bestCamB = null;
                          let maxOppositeScore = -Infinity;

                          for (let i = 1; i < allCameras.length; i++) {
                            const candidateB = allCameras[i];
                            const vectorB = [candidateB.location[0] - closestCheckpoint[0], candidateB.location[1] - closestCheckpoint[1]];
                            const dotProduct = vectorA[0] * vectorB[0] + vectorA[1] * vectorB[1];
                            const magnitudeA = Math.sqrt(vectorA[0] ** 2 + vectorA[1] ** 2);
                            const magnitudeB = Math.sqrt(vectorB[0] ** 2 + vectorB[1] ** 2);
                            if (magnitudeA > 0 && magnitudeB > 0) {
                              const cosTheta = dotProduct / (magnitudeA * magnitudeB);
                              const score = -cosTheta / (candidateB.distance + 1);
                              if (score > maxOppositeScore) {
                                maxOppositeScore = score;
                                bestCamB = candidateB;
                              }
                            }
                          }

                          if (bestCamB) {
                            const camB = bestCamB;
                            const isPassOnPair = pass.camera_id === camA.id || pass.camera_id === camB.id;
                            
                            if(isPassOnPair) {
                                const now = Date.now() + clockOffset;
                                const timeSince = arrivalTime ? (now - arrivalTime) : (now - passTime);
                                const timeRemainingMs = checkpointTimeout * 1000 - timeSince;

                                if (timeRemainingMs > 0) {
                                    timeRemaining = (timeRemainingMs / 1000).toFixed(1);
                                } else {
                                    timeRemaining = "หมดเวลา";
                                }
                            }
                          }
                        }
                      }
                    }

                    return (
                      <tr
                        key={pass.id}
                        onClick={() => handleCarClick(pass.license_plate)}
                        className={`cursor-pointer hover:bg-gray-50 transition-colors duration-200 ${isBlacklisted ? "bg-red-200 animate-pulse text-red-900 font-medium" : ""}`}
                      >
                        <td className="py-2 px-4 border-b">
                          {pass.id}
                          {isBlacklisted && (
                            <span className="ml-2 text-red-600 animate-pulse">⚠️</span>
                          )}
                        </td>
                        <td className="py-2 px-4 border-b font-medium text-blue-600 hover:text-blue-800">
                          {pass.license_plate}
                        </td>
                        <td className="py-2 px-4 border-b">{pass.camera_name}</td>
                        <td className="py-2 px-4 border-b">
                          {pass.camera_location ? pass.camera_location : <span className="text-gray-400 italic">ไม่ทราบตำแหน่ง</span>}
                        </td>
                        <td className="py-2 px-4 border-b">{new Date(pass.pass_time).toLocaleString("th-TH")}</td>
                        <td className={`py-2 px-4 border-b font-mono ${timeRemaining === "หมดเวลา" ? "text-red-500" : "text-gray-700"}`}>{timeRemaining}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {vehiclePasses.length === 0 && (
              <p className="text-gray-500 text-center py-4">ไม่มีข้อมูลยานพาหนะ</p>
            )}
          </div>

          <div className="bg-white shadow-lg rounded-lg p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-700">จุดตรวจ</h2>
              {checkpoints.length > 0 && (
                <button
                  onClick={clearAllCheckpoints}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  ล้างจุดตรวจ
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-4 mb-4">
              {checkpoints.length > 0 ? (
                checkpoints.map((checkpoint, index) => (
                  <div key={index} className="flex items-center bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
                    จุดตรวจที่ ({checkpoint[0].toFixed(4)}, {checkpoint[1].toFixed(4)})
                    <button
                      onClick={() => handleCheckpointRemove(checkpoint)}
                      className="ml-2 text-red-600 hover:text-red-800"
                    >
                      ×
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-gray-600">ยังไม่ได้ตั้งจุดตรวจ</p>
              )}
            </div>
            <div className="mb-4">
              <label htmlFor="checkpointTimeout" className="text-gray-700 font-medium mr-2">
                ระยะเวลารอการตรวจสอบด่าน (วินาที):
              </label>
              <select
                id="checkpointTimeout"
                value={checkpointTimeout}
                onChange={handleTimeoutChange}
                className="p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={10}>10 วินาที</option>
                <option value={30}>30 วินาที</option>
                <option value={60}>60 วินาที</option>
              </select>
            </div>
            <p className="text-gray-600">คลิกที่ใดก็ได้บนแผนที่เพื่อเพิ่มจุดตรวจ คลิกที่เครื่องหมายจุดตรวจเพื่อลบ</p>
          </div>

          <div id="map-section" className="bg-white shadow-lg rounded-lg p-6 z-0">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">ตำแหน่งกล้อง</h2>
            <div className="h-full w-full rounded-lg overflow-visible">
              <MapWithNoSSR
                center={mapCenter}
                cameras={cameraLocations}
                carHistory={[]}
                showCarMarkers={false}
                showRoute={false}
                checkpoints={checkpoints}
                onCheckpointAdd={handleCheckpointAdd}
                onCheckpointRemove={handleCheckpointRemove}
              />
            </div>
          </div>
        </div>

        {showPopup && (
          <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75 z-[1000]">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
              <h3 className="text-lg font-bold text-gray-800 mb-4">เลือกกล้อง</h3>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((cam) => {
                  const isSelected = selectedCameras.includes(cam) || tempSelectedCameras.includes(cam);
                  return (
                    <div
                      key={cam}
                      onClick={() => toggleCameraInTemp(cam)}
                      className="flex items-center justify-between p-3 hover:bg-gray-100 rounded cursor-pointer transition-colors duration-200"
                    >
                      <span className="text-gray-700">กล้อง {cam}</span>
                      <div
                        className={`w-5 h-5 rounded-full border-2 ${isSelected ? "bg-blue-600 border-blue-600" : "bg-white border-gray-300"}`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end gap-4 mt-6">
                <button
                  onClick={() => {
                    setShowPopup(false);
                    setTempSelectedCameras([]);
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 transition-colors duration-200"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={() => addMultipleCameras(tempSelectedCameras)}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors duration-200"
                  disabled={tempSelectedCameras.length === 0}
                >
                  ยืนยัน
                </button>
              </div>
            </div>
          </div>
        )}
        {showSimulatePopup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
              <h3 className="text-lg font-bold mb-4 text-gray-800">จำลองการตรวจจับรถ</h3>
              <label className="block mb-1 text-gray-700">เลือกรถ</label>
              <div className="max-h-48 overflow-y-auto border p-2 rounded mb-4">
                {vehiclesList.map((v) => (
                  <label key={v.id} className="flex items-center space-x-2 py-1">
                    <input
                      type="checkbox"
                      checked={selectedVehicleIds.includes(v.id)}
                      onChange={(e) => {
                        setSelectedVehicleIds((prev) =>
                          e.target.checked ? [...prev, v.id] : prev.filter((id) => id !== v.id)
                        );
                      }}
                    />
                    <span>{v.license_plate} ({v.vehicle_brand}, {v.vehicle_color})</span>
                  </label>
                ))}
              </div>
              <label className="block mb-1 text-gray-700">เลือกกล้อง</label>
              <select
                value={selectedCameraId ?? ''}
                onChange={(e) => setSelectedCameraId(Number(e.target.value))}
                className="w-full p-2 border rounded mb-4"
              >
                {selectedCameras.map((camId) => (
                  <option key={camId} value={camId}>กล้อง {camId}</option>
                ))}
              </select>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowSimulatePopup(false)}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={async () => {
                    const token = localStorage.getItem("token");
                    if (!token || selectedVehicleIds.length === 0 || !selectedCameraId) {
                      toast.error("กรุณาเลือกรถและกล้อง");
                      return;
                    }
                    try {
                      for (const vehicleId of selectedVehicleIds) {
                        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/vehicle-pass`, {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({
                            vehicle_id: vehicleId,
                            camera_id: selectedCameraId,
                          }),
                        });
                      }
                      toast.success("🚗 จำลองรถสำเร็จ");
                      setShowSimulatePopup(false);
                    } catch (err) {
                      toast.error("❌ เกิดข้อผิดพลาดขณะยิง API");
                      console.error(err);
                    }
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  ยืนยัน
                </button>
              </div>
            </div>
          </div>
        )}
        {showVehicleProfilePopup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative">
              <h2 className="text-xl font-semibold mb-4">จัดการโปรไฟล์รถ</h2>
              {vehicleProfiles.length === 0 ? (
                <div className="text-center text-gray-500 p-6">
                  <p className="text-lg mb-2">🚘 ยังไม่มีโปรไฟล์รถ</p>
                  <p className="text-sm text-gray-400">กรุณาเพิ่มโปรไฟล์รถก่อนเริ่มการจำลอง</p>
                </div>
              ) : (
                <table className="w-full text-sm text-left text-gray-700 border mb-4">
                  <thead className="bg-gray-50 text-xs uppercase">
                    <tr>
                      <th className="py-2 px-4 border-b">ทะเบียน</th>
                      <th className="py-2 px-4 border-b">ความเร็ว (km/h)</th>
                      <th className="py-2 px-4 border-b">เวลาเริ่ม</th>
                      <th className="py-2 px-4 border-b">ลำดับกล้อง</th>
                      <th className="py-2 px-4 border-b">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicleProfiles.map((p, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="py-2 px-4 border-b">{p.license_plate}</td>
                        <td className="py-2 px-4 border-b">{p.speed}</td>
                        <td className="py-2 px-4 border-b">
                          {new Date(p.start_time).toLocaleString("th-TH")}
                        </td>
                        <td className="py-2 px-4 border-b">{p.camera_path.join(" → ")}</td>
                        <td className="py-2 px-4 border-b">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => runSimulationFromProfiles([p])}
                                className="text-green-600 hover:text-white border border-green-600 rounded px-3 py-1 text-sm hover:bg-green-600 transition duration-200"
                              >
                                รัน
                              </button>
                              <button
                                onClick={() => removeProfile(i)}
                                className="text-red-600 hover:text-white border border-red-600 rounded px-3 py-1 text-sm hover:bg-red-600 transition duration-200"
                              >
                                ลบ
                              </button>
                            </div>
                            {(() => {
                              const vehicle = vehiclesList.find(v => v.license_plate === p.license_plate);
                              const profileKey = vehicle ? `${vehicle.id}_${p.start_time}` : "";
                              const status = simulationStatus[profileKey];
                              return status ? (
                                <div className="text-xs text-gray-500 italic">{status}</div>
                              ) : null;
                            })()}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="flex justify-between">
                <button
                  onClick={() => runSimulationFromProfiles()}
                  className="bg-purple-600 text-white px-4 py-2 rounded"
                >
                  รันทั้งหมด
                </button>
                <button
                  onClick={() => setShowAddProfilePopup(true)}
                  className="bg-blue-500 text-white px-4 py-2 rounded"
                >
                  เพิ่มโปรไฟล์ใหม่
                </button>
              </div>
              <button
                onClick={() => setShowVehicleProfilePopup(false)}
                className="absolute top-3 right-4 text-gray-500 hover:text-red-600"
              >
                ❌
              </button>
            </div>
          </div>
        )}
        {showAddProfilePopup && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
              <h3 className="text-lg font-bold mb-4 text-gray-800">เพิ่มโปรไฟล์รถ</h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.target as HTMLFormElement;
                  const licensePlate = form.licensePlate.value;
                  const speed = parseFloat(form.speed.value);
                  const startTime = form.startTime.value;

                  if (!licensePlate || !speed || !startTime || cameraPath.length === 0) {
                    toast.error("กรุณากรอกข้อมูลให้ครบ และเลือกลำดับกล้องอย่างน้อย 1 ตัว");
                    return;
                  }

                  setVehicleProfiles((prev) => [
                    ...prev,
                    { license_plate: licensePlate, speed, start_time: startTime, camera_path: cameraPath }
                  ]);
                  toast.success("เพิ่มโปรไฟล์เรียบร้อย");
                  setShowAddProfilePopup(false);
                }}
              >
                <label>ทะเบียนรถ</label>
                <select name="licensePlate" className="w-full border p-2 mb-3">
                  {vehiclesList.map((v) => (
                    <option key={v.id} value={v.license_plate}>
                      {v.license_plate} ({v.vehicle_brand})
                    </option>
                  ))}
                </select>
                <label>ความเร็ว (km/h)</label>
                <input name="speed" type="number" min="1" max="999" step="1" className="w-full border p-2 mb-3" required onInput={(e) => {
                  const input = e.target as HTMLInputElement;
                  if (parseInt(input.value) > 999) {
                    input.value = "999";
                  }
                  if (parseInt(input.value) < 1) {
                    input.value = "1";
                  }
                }} />
                <label>เวลาเริ่ม</label>
                <input name="startTime" type="datetime-local" className="w-full border p-2 mb-3" min={new Date().toISOString().slice(0, 16)} required />
                <div className="mb-4">
                  <label className="block text-gray-700 mb-2">เลือกลำดับกล้อง</label>
                  <div className="space-y-2 max-h-60 overflow-y-auto border p-2 rounded">
                    {Array.from({ length: 18 }, (_, i) => i + 1).map((cameraId) => {
                      const index = cameraPath.indexOf(cameraId);
                      return (
                        <div key={cameraId} className="flex items-center justify-between">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={index !== -1}
                              onChange={(e) => {
                                setCameraPath((prev) => {
                                  if (e.target.checked) return [...prev, cameraId];
                                  return prev.filter((id) => id !== cameraId);
                                });
                              }}
                            />
                            <span>กล้อง {cameraId}</span>
                          </label>
                          {index !== -1 && (
                            <span className="text-xs text-gray-500">ลำดับที่ {index + 1}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddProfilePopup(false)}
                    className="px-4 py-2 bg-gray-300 rounded"
                  >
                    ยกเลิก
                  </button>
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">
                    เพิ่ม
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}