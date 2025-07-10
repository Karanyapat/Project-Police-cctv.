import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import dynamic from "next/dynamic";
import axios from "axios";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Head from 'next/head';
import io from "socket.io-client";

// สร้าง socket connection
const socket = io("http://localhost:5000");

// กำหนด interface สำหรับ MapProps
interface MapProps {
  center: [number, number];
  cameras: Record<number, [number, number]>;
  carHistory: CarHistoryItem[];
  showCarMarkers?: boolean;
  showRoute?: boolean;
  checkpoints?: [number, number][]; // คงไว้เพื่อแสดง checkpoints
}

const MapWithNoSSR = dynamic(() => import("../components/Map"), {
  ssr: false,
}) as React.ComponentType<MapProps>;

const cameraLocations: Record<number, [number, number]> = {
  1: [16.91229, 100.187262],
  2: [16.9046, 100.1912],
  3: [16.8931, 100.1978],
  4: [16.8879, 100.2005],
  5: [16.8723, 100.2091],
  6: [16.8640, 100.2137],
  7: [16.8615, 100.2127],
  8: [16.8582, 100.2066],
  9: [16.8531, 100.2033],
  10: [16.8459, 100.2031],
  11: [16.8634, 100.2163],
  12: [16.8652, 100.2231],
  13: [16.8649, 100.2307],
  14: [16.8647, 100.2407],
  15: [16.8605, 100.2157],
  16: [16.8558, 100.2183],
  17: [16.8508, 100.2212],
  18: [16.8466, 100.2262]
};

interface Vehicle {
  id: number;
  license_plate: string;
  province: string;
  vehicle_type: string;
  vehicle_color: string;
  vehicle_brand: string;
  license_plate_img_path?: string;
}

interface VehiclePass {
  id: number;
  vehicle_id: number;
  camera_id: number;
  camera_name: string;
  camera_location: string;
  pass_time: string;
}

interface CarHistoryItem {
  id: number;
  plate: string;
  cameraId: number;
  cameraName: string;
  timestamp: string;
  location: [number, number];
}

export default function RouteHistory() {
  const router = useRouter();
  const { vehicle_id, is_blacklisted, blacklist_reason } = router.query;
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [vehiclePasses, setVehiclePasses] = useState<VehiclePass[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([16.9081, 100.1882]);
  const [currentPage, setCurrentPage] = useState(1);
  const [daysAgo, setDaysAgo] = useState(7); // ค่าเริ่มต้น: ย้อนหลัง 7 วัน
  const [checkpoints, setCheckpoints] = useState<[number, number][]>([]);
  const passesPerPage = 5;

  // ตรวจสอบสถานะล็อกอิน
  useEffect(() => {
    const user = localStorage.getItem("@user");
    if (!user) {
      router.push("/login");
      return;
    }
  }, [router]);

  // โหลด checkpoints จาก localStorage เมื่อหน้าโหลด
  useEffect(() => {
    const savedCheckpoints = localStorage.getItem("checkpoints");
    if (savedCheckpoints) {
      setCheckpoints(JSON.parse(savedCheckpoints));
    }
  }, []);

  useEffect(() => {
    if (!vehicle_id) return;

    socket.emit("join_vehicle_room", { vehicle_id });

    socket.on("new_pass", (newPass: VehiclePass) => {
      if (newPass.vehicle_id === Number(vehicle_id)) {
        setVehiclePasses(prev => {
          const updated = [newPass, ...prev.filter(p => p.id !== newPass.id)];
          return updated.sort((a, b) =>
            new Date(b.pass_time).getTime() - new Date(a.pass_time).getTime()
          );
        });

        const newCamLoc = cameraLocations[newPass.camera_id];
        if (newCamLoc) {
          setMapCenter(newCamLoc);
        }
      }
    });

    return () => {
      socket.emit("leave_vehicle_room", { vehicle_id });
      socket.off("new_pass");
    };
  }, [vehicle_id]);

  const fetchVehicleData = async () => {
    const token = localStorage.getItem("token");
    const vehicleId = vehicle_id ? parseInt(vehicle_id as string, 10) : null;
    if (!token || !vehicleId || isNaN(vehicleId)) {
      setError("No token or invalid vehicle ID found. Please login or select a vehicle.");
      router.push("/login");
      return;
    }

    try {
      const vehicleRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/vehicles/${vehicleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const foundVehicle = vehicleRes.data.vehicle;
      if (!foundVehicle) {
        setError("Vehicle not found.");
        return;
      }
      setVehicle(foundVehicle);

      const passesRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/vehicle-pass/history`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { vehicle_id: vehicleId, days_ago: daysAgo }, // เพิ่ม days_ago ใน params
      });
      if (passesRes.status === 404) {
        setError("No pass history found for this vehicle.");
        setVehiclePasses([]);
        return;
      }
      if (!passesRes.data.data) {
        setVehiclePasses([]);
        return;
      }

      const sortedPasses = passesRes.data.data.sort(
        (a: VehiclePass, b: VehiclePass) =>
          new Date(b.pass_time).getTime() - new Date(a.pass_time).getTime()
      );
      setVehiclePasses(sortedPasses);

      if (sortedPasses.length > 0) {
        const latestCameraId = sortedPasses[0].camera_id;
        const newCenter = cameraLocations[latestCameraId];
        if (newCenter) setMapCenter(newCenter);
      }

      setError(null);
    } catch (err: any) {
      console.error("Error fetching data:", err.response?.data || err);
      setError(err.response?.data?.message || "Failed to fetch vehicle data.");
      if (err.response?.status === 401 || err.response?.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("@user");
        router.push("/login");
      }
    }
  };

  useEffect(() => {
    if (vehicle_id) fetchVehicleData(); // fetchVehicleData จะถูกเรียกเมื่อ vehicle_id หรือ daysAgo เปลี่ยน
  }, [vehicle_id, daysAgo]);

  useEffect(() => {
  }, [vehiclePasses]);

  const indexOfLastPass = currentPage * passesPerPage;
  const indexOfFirstPass = indexOfLastPass - passesPerPage;
  const currentPasses = vehiclePasses.slice(indexOfFirstPass, indexOfLastPass);
  const totalPages = Math.ceil(vehiclePasses.length / passesPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Function สำหรับจัดการ pagination ที่ปรับปรุงแล้ว
  const getPaginationItems = () => {
    const maxVisiblePages = 10;
    const halfVisible = Math.floor(maxVisiblePages / 2);

    let startPage = Math.max(1, currentPage - halfVisible);
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    // ปรับ startPage ถ้า endPage น้อยเกินไป
    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    return { startPage, endPage };
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const isBlacklisted = is_blacklisted === "true";
  const blacklistReason = blacklist_reason || "ไม่ระบุเหตุผล";

  const carHistory: CarHistoryItem[] = vehiclePasses.map((pass) => ({
    id: pass.id,
    plate: vehicle?.license_plate || "",
    cameraId: pass.camera_id,
    cameraName: pass.camera_name,
    cameraLocation: pass.camera_location,
    timestamp: pass.pass_time,
    location: cameraLocations[pass.camera_id] as [number, number],
  }));

  return (
    <>
      <Head>
        <title>History</title>
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
        <div className="max-w-7xl mx-auto">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded-lg shadow-md mb-6">
              <p className="font-semibold">{error}</p>
            </div>
          )}
          <div className="flex items-center justify-between mb-6">
            {/* Title remains here */}
            <h1 className="text-3xl font-bold text-gray-800">
              Route History: {vehicle ? vehicle.license_plate : "Loading..."}
            </h1>

            {/* Blacklisted badge (unchanged) */}
            {isBlacklisted && (
              <span className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-semibold shadow-md flex items-center animate-pulse">
                <span className="mr-1">⚠️</span> Blacklisted: {blacklistReason}
              </span>
            )}
          </div>

          {vehicle && (
            <div className="bg-white shadow-lg rounded-lg p-6 mb-6 border border-gray-200">
              <h2 className="text-2xl font-semibold text-gray-700 mb-4">Vehicle Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="text-gray-800 text-2xl leading-loose">
                  <p className="mt-4">
                    <strong className="text-gray-800 font-bold text-3xl">License Plate:</strong>{" "}
                    <span className="font-medium">{vehicle.license_plate}</span>
                  </p>
                  <p className="mt-4">
                    <strong className="text-gray-800 font-bold text-3xl">Province:</strong>{" "}
                    <span className="font-medium">{vehicle.province}</span>
                  </p>
                </div>
                <div className="text-gray-800 text-2xl leading-loose">
                  <p className="mt-4">
                    <strong className="text-gray-800 font-bold text-3xl">Type:</strong>{" "}
                    <span className="font-medium">{vehicle.vehicle_type}</span>
                  </p>
                  <p className="mt-4">
                    <strong className="text-gray-800 font-bold text-3xl">Color:</strong>{" "}
                    <span className="font-medium">{vehicle.vehicle_color}</span>
                  </p>
                </div>
                <div className="text-gray-800 text-2xl leading-loose md:col-span-2">
                  <p className="mt-4">
                    <strong className="text-gray-800 font-bold text-3xl">Brand:</strong>{" "}
                    <span className="font-medium">{vehicle.vehicle_brand}</span>
                  </p>
                </div>
                {vehicle.license_plate_img_path && (
                  <div className="mt-4 md:col-span-2">
                    <strong className="text-gray-800 font-bold text-3xl">License Plate Image:</strong>
                    <img
                      src={`${process.env.NEXT_PUBLIC_API_URL}/api/uploads/${vehicle.license_plate_img_path}`}
                      alt="License Plate"
                      className="mt-2 w-96 h-auto rounded-lg shadow-md object-cover"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-white shadow-lg rounded-lg p-6 mb-6 border border-gray-200">
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">Pass History</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-gray-700">
                <thead className="bg-gray-50 text-xs uppercase">
                  <tr>
                    <th className="py-3 px-6 font-semibold border-b">ID</th>
                    <th className="py-3 px-6 font-semibold border-b">Camera</th>
                    <th className="py-3 px-6 font-semibold border-b">Location</th>
                    <th className="py-3 px-6 font-semibold border-b">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {currentPasses.length > 0 ? (
                    currentPasses.map((pass, index) => (
                      <tr
                        key={pass.id}
                        className={`border-b hover:bg-gray-50 transition-colors duration-200 ${index % 2 === 0 ? "bg-gray-50" : "bg-white"
                          }`}
                      >
                        <td className="py-4 px-6 text-gray-600">{pass.id}</td>
                        <td className="py-4 px-6 text-gray-600">{pass.camera_name}</td>
                        <td className="py-4 px-6 text-gray-600">{pass.camera_location}</td>
                        <td className="py-4 px-6 text-gray-600">{formatDate(pass.pass_time)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-6 px-6 text-center text-gray-500">
                        No pass history available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ส่วน Pagination ที่ปรับปรุงแล้ว */}
            {totalPages > 1 && (
              <div className="mt-6 flex flex-col sm:flex-row justify-center items-center space-y-2 sm:space-y-0 sm:space-x-2">
                {/* ข้อมูลแสดงหน้าปัจจุบัน */}
                <div className="text-sm text-gray-600 mb-2 sm:mb-0 sm:mr-4">
                  Page {currentPage} of {totalPages} ({vehiclePasses.length} total records)
                </div>

                <div className="flex flex-wrap justify-center items-center space-x-1">
                  {/* ปุ่ม First Page */}
                  {currentPage > 1 && (
                    <button
                      onClick={() => handlePageChange(1)}
                      className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                      title="First Page"
                    >
                      ««
                    </button>
                  )}

                  {/* ปุ่ม Previous */}
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === 1
                        ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                  >
                    Previous
                  </button>

                  {/* แสดง ... ถ้าเริ่มต้นไม่ใช่หน้า 1 */}
                  {(() => {
                    const { startPage, endPage } = getPaginationItems();

                    return (
                      <>
                        {startPage > 1 && (
                          <span className="px-3 py-2 text-gray-500">...</span>
                        )}

                        {/* ปุ่มหน้าต่างๆ */}
                        {Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i).map((page) => (
                          <button
                            key={page}
                            onClick={() => handlePageChange(page)}
                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === page
                                ? "bg-blue-600 text-white shadow-md"
                                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                              }`}
                          >
                            {page}
                          </button>
                        ))}

                        {/* แสดง ... ถ้าจบไม่ใช่หน้าสุดท้าย */}
                        {endPage < totalPages && (
                          <span className="px-3 py-2 text-gray-500">...</span>
                        )}
                      </>
                    );
                  })()}

                  {/* ปุ่ม Next */}
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${currentPage === totalPages
                        ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                  >
                    Next
                  </button>

                  {/* ปุ่ม Last Page */}
                  {currentPage < totalPages && (
                    <button
                      onClick={() => handlePageChange(totalPages)}
                      className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                      title="Last Page"
                    >
                      »»
                    </button>
                  )}
                </div>

                {/* Quick jump to page */}
                <div className="flex items-center space-x-2 mt-2 sm:mt-0 sm:ml-4">
                  <span className="text-sm text-gray-600">Go to:</span>
                  <input
                    type="number"
                    min="1"
                    max={totalPages}
                    placeholder={currentPage.toString()}
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        const target = e.target as HTMLInputElement;
                        const page = parseInt(target.value);
                        if (page >= 1 && page <= totalPages) {
                          handlePageChange(page);
                          target.value = '';
                        }
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="bg-white shadow-lg rounded-lg p-6 border border-gray-200 mt-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold text-gray-700">Route Map</h2>
              <div className="flex items-center">
                <label htmlFor="days-ago" className="mr-2 text-md font-semibold text-gray-800">
                  Show history for last:
                </label>
                <select
                  id="days-ago"
                  value={daysAgo}
                  onChange={(e) => setDaysAgo(Number(e.target.value))}
                  className="block w-auto pl-3 pr-10 py-2 text-md font-medium text-gray-900 bg-white border-2 border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-lg shadow-md hover:border-gray-500 transition-colors duration-150"
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((days) => (
                    <option key={days} value={days}>
                      {days} {days === 1 ? "Day" : "Days"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="h-120 w-full rounded-lg overflow-visible">
              <MapWithNoSSR
                center={mapCenter}
                cameras={cameraLocations}
                carHistory={carHistory}
                showCarMarkers={true}
                showRoute={true}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}