import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAngleDown, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import Navbar from "../components/Navbar";
import axios from "axios";
import { CSVLink } from "react-csv";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import Head from 'next/head';

interface SearchResult {
  id: number;
  license_plate: string;
  province: string;
  camera_name: string;
  pass_time: string;
  is_blacklisted?: boolean;
  blacklist_reason?: string;
}

const formatDate = (timestamp: string) => {
  return new Date(timestamp).toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const formatTime = (timestamp: string) => {
  return new Date(timestamp).toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

export default function Search() {
  const router = useRouter();
  const [licensePlate, setLicensePlate] = useState("");
  const [province, setProvince] = useState("");
  const [cameraPosition, setCameraPosition] = useState<{ first: string; second: string }>({ first: "", second: "" });
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [date, setDate] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSearched, setIsSearched] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // ตรวจสอบสถานะล็อกอิน
  useEffect(() => {
    const user = localStorage.getItem("@user");
    if (!user) {
      router.push("/login");
      return;
    }
  }, [router]);

  const timeOptions = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, "0");
    return `${hour}:00`;
  });

  const csvData = results.map((result) => ({
    ID: result.id,
    "ป้ายทะเบียน": result.license_plate,
    "จังหวัด": result.province,
    "ชื่อกล้อง": result.camera_name,
    "วันที่": formatDate(result.pass_time),
    "เวลา": formatTime(result.pass_time),
    "อยู่ในบัญชีดำ": result.is_blacklisted ? "ใช่" : "ไม่ใช่",
    "เหตุผลบัญชีดำ": result.blacklist_reason || "ไม่มี",
  }));

  const exportPDF = async () => {
    if (results.length === 0) {
      alert("ไม่มีข้อมูลให้ export");
      return;
    }

    if (!tableRef.current) {
      alert("ไม่พบตารางสำหรับ export");
      return;
    }

    try {
      const canvas = await html2canvas(tableRef.current, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const imgWidth = 280;
      const pageHeight = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      let position = 0;

      pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save("ผลการค้นหา.pdf");
    } catch (error: unknown) {
      console.error("ข้อผิดพลาดในการ export PDF:", error);
      if (error instanceof Error) {
        alert(`เกิดข้อผิดพลาดในการ export PDF: ${error.message}`);
      } else {
        alert("เกิดข้อผิดพลาดในการ export PDF: ไม่ทราบสาเหตุ");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData: Record<string, string> = {};
    if (licensePlate) formData.license_plate = licensePlate;
    if (province) formData.province = province;

    // จัดการ camera_ids: ถ้าเลือกกล้อง, ถ้าเลือกกล้องเดียวกัน, หรือไม่เลือกเลย
    if (cameraPosition.first || cameraPosition.second) {
      if (cameraPosition.first && cameraPosition.second) {
        // ถ้าเลือกทั้งสองกล้อง
        if (cameraPosition.first === cameraPosition.second) {
          // ถ้าเลือกกล้องเดียวกัน ส่งแค่ ID เดียว
          formData.camera_ids = cameraPosition.first;
        } else {
          // ถ้าเลือกกล้องต่างกัน ส่งทั้งสอง ID
          formData.camera_ids = [cameraPosition.first, cameraPosition.second].join(",");
        }
      } else if (cameraPosition.first) {
        // ถ้าเลือกเฉพาะกล้องแรก
        formData.camera_ids = cameraPosition.first;
      } else if (cameraPosition.second) {
        // ถ้าเลือกเฉพาะกล้องที่สอง
        formData.camera_ids = cameraPosition.second;
      }
    }
    // ถ้าไม่เลือกกล้องเลย (ทั้งสองว่าง) ไม่ต้องส่ง camera_ids เพื่อให้ API ดึงข้อมูลทั้งหมด

    if (startTime && date) formData.start_time = `${date}T${startTime}:00Z`;
    if (endTime && date) formData.end_time = `${date}T${endTime}:59Z`;
    if (date) formData.date = date;

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("ไม่พบ token กรุณา login อีกครั้ง");
        setIsSearched(true);
        return;
      }

      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/vehicle-pass/search`, {
        headers: { Authorization: `Bearer ${token}` },
        params: formData,
      });

      if (response.data.status === "ok") {
        if (response.data.data && response.data.data.length > 0) {
          const mappedResults: SearchResult[] = response.data.data.map((item: any) => ({
            id: item.id,
            license_plate: item.license_plate,
            province: item.province,
            camera_name: item.camera_name,
            pass_time: item.pass_time,
            is_blacklisted: item.is_blacklisted || false,
            blacklist_reason: item.blacklist_reason || null,
          }));
          setResults(mappedResults);
          setError(null);
        } else {
          setResults([]);
          setError(null);
        }
      } else {
        setResults([]);
        setError("การตอบกลับจากเซิร์ฟเวอร์ไม่ถูกต้อง");
      }
    } catch (err: any) {
      console.error("ข้อผิดพลาดในการค้นหา:", err);
      setError(err.response?.data?.message || "ไม่สามารถค้นหาได้");
      setResults([]);
    }
    setIsSearched(true);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Head>
        <title>ค้นหาประวัติ</title>
        <meta name="description" content="ยินดีต้อนรับสู่ระบบค้นหาการผ่านกล้อง" />
        <link rel="icon" href="/police-logo.png" />
      </Head>
      <Navbar />
      <div className="max-w-5xl mx-auto mt-10 p-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">ค้นหาประวัติการผ่านกล้อง</h1>

        <form onSubmit={handleSubmit} className="bg-white shadow-lg rounded-lg p-6 space-y-6">
          {/* ป้ายทะเบียน */}
          <div className="flex items-center space-x-4">
            <label className="w-32 font-medium text-gray-700">ป้ายทะเบียน :</label>
            <input
              type="text"
              className="flex-1 bg-gray-100 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="กรอกป้ายทะเบียน"
              value={licensePlate}
              onChange={(e) => setLicensePlate(e.target.value)}
            />
          </div>

          {/* จังหวัด */}
          <div className="flex items-center space-x-4">
            <label className="w-32 font-medium text-gray-700">จังหวัด :</label>
            <div className="relative flex-1">
              <select
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-4 py-2 appearance-none focus:outline-none focus:ring-2 focus:ring-red-500"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
              >
                <option value="">เลือกจังหวัด</option>
                <option value="กรุงเทพมหานคร">กรุงเทพมหานคร</option>
                <option value="กระบี่">กระบี่</option>
                <option value="กาญจนบุรี">กาญจนบุรี</option>
                <option value="กาฬสินธุ์">กาฬสินธุ์</option>
                <option value="กำแพงเพชร">กำแพงเพชร</option>
                <option value="ขอนแก่น">ขอนแก่น</option>
                <option value="ชลบุรี">ชลบุรี</option>
                <option value="ชัยนาท">ชัยนาท</option>
                <option value="ชัยภูมิ">ชัยภูมิ</option>
                <option value="จันทบุรี">จันทบุรี</option>
                <option value="ฉะเชิงเทรา">ฉะเชิงเทรา</option>
                <option value="ชุมพร">ชุมพร</option>
                <option value="เชียงราย">เชียงราย</option>
                <option value="เชียงใหม่">เชียงใหม่</option>
                <option value="ตรัง">ตรัง</option>
                <option value="ตราด">ตราด</option>
                <option value="ตาก">ตาก</option>
                <option value="นครนายก">นครนายก</option>
                <option value="นครปฐม">นครปฐม</option>
                <option value="นครพนม">นครพนม</option>
                <option value="นครราชสีมา">นครราชสีมา</option>
                <option value="นครศรีธรรมราช">นครศรีธรรมราช</option>
                <option value="นครสวรรค์">นครสวรรค์</option>
                <option value="นนทบุรี">นนทบุรี</option>
                <option value="นราธิวาส">นราธิวาส</option>
                <option value="น่าน">น่าน</option>
                <option value="บุรีรัมย์">บุรีรัมย์</option>
                <option value="ปทุมธานี">ปทุมธานี</option>
                <option value="ประจวบคีรีขันธ์">ประจวบคีรีขันธ์</option>
                <option value="ปราจีนบุรี">ปราจีนบุรี</option>
                <option value="ปัตตานี">ปัตตานี</option>
                <option value="พระนครศรีอยุธยา">พระนครศรีอยุธยา</option>
                <option value="พะเยา">พะเยา</option>
                <option value="พัทลุง">พัทลุง</option>
                <option value="พิจิตร">พิจิตร</option>
                <option value="พิษณุโลก">พิษณุโลก</option>
                <option value="เพชรบูรณ์">เพชรบูรณ์</option>
                <option value="เพชรบุรี">เพชรบุรี</option>
                <option value="แพร่">แพร่</option>
                <option value="ภูเก็ต">ภูเก็ต</option>
                <option value="แม่ฮ่องสอน">แม่ฮ่องสอน</option>
                <option value="ยโสธร">ยโสธร</option>
                <option value="ยะลา">ยะลา</option>
                <option value="ร้อยเอ็ด">ร้อยเอ็ด</option>
                <option value="ระยอง">ระยอง</option>
                <option value="ราชบุรี">ราชบุรี</option>
                <option value="ลพบุรี">ลพบุรี</option>
                <option value="ลำปาง">ลำปาง</option>
                <option value="ลำพูน">ลำพูน</option>
                <option value="เลย">เลย</option>
                <option value="ศรีสะเกษ">ศรีสะเกษ</option>
                <option value="สกลนคร">สกลนคร</option>
                <option value="สงขลา">สงขลา</option>
                <option value="สตูล">สตูล</option>
                <option value="สมุทรปราการ">สมุทรปราการ</option>
                <option value="สมุทรสงคราม">สมุทรสงคราม</option>
                <option value="สมุทรสาคร">สมุทรสาคร</option>
                <option value="สระแก้ว">สระแก้ว</option>
                <option value="สระบุรี">สระบุรี</option>
                <option value="สิงห์บุรี">สิงห์บุรี</option>
                <option value="สุโขทัย">สุโขทัย</option>
                <option value="สุพรรณบุรี">สุพรรณบุรี</option>
                <option value="สุราษฎร์ธานี">สุราษฎร์ธานี</option>
                <option value="สุรินทร์">สุรินทร์</option>
                <option value="หนองคาย">หนองคาย</option>
                <option value="หนองบัวลำภู">หนองบัวลำภู</option>
                <option value="อ่างทอง">อ่างทอง</option>
                <option value="อุดรธานี">อุดรธานี</option>
                <option value="อุตรดิตถ์">อุตรดิตถ์</option>
                <option value="อุบลราชธานี">อุบลราชธานี</option>
                <option value="อำนาจเจริญ">อำนาจเจริญ</option>
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                <FontAwesomeIcon icon={faAngleDown} />
              </span>
            </div>
          </div>

          {/* เส้นทางการผ่านกล้อง */}
          <div className="flex items-center space-x-4">
            <label className="w-32 font-medium text-gray-700">เส้นทางการผ่านกล้อง :</label>
            <div className="flex flex-1 space-x-4">
              {/* กล้องจุดเริ่มต้น */}
              <div className="relative flex-1">
                <select
                  className="w-full bg-gray-100 border border-gray-300 rounded-lg px-4 py-2 appearance-none focus:outline-none focus:ring-2 focus:ring-red-500"
                  value={cameraPosition.first}
                  onChange={(e) => setCameraPosition({ ...cameraPosition, first: e.target.value })}
                >
                  <option value="">เลือกกล้องจุดเริ่มต้น</option>
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                    <option key={num} value={num}>
                      กล้อง {num}
                    </option>
                  ))}
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                  <FontAwesomeIcon icon={faAngleDown} />
                </span>
              </div>
              {/* กล้องจุดต่อไป */}
              <div className="relative flex-1">
                <select
                  className="w-full bg-gray-100 border border-gray-300 rounded-lg px-4 py-2 appearance-none focus:outline-none focus:ring-2 focus:ring-red-500"
                  value={cameraPosition.second}
                  onChange={(e) => setCameraPosition({ ...cameraPosition, second: e.target.value })}
                >
                  <option value="">เลือกกล้องจุดต่อไป</option>
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                    <option key={num} value={num}>
                      กล้อง {num}
                    </option>
                  ))}
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                  <FontAwesomeIcon icon={faAngleDown} />
                </span>
              </div>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">เลือกกล้องจุดเริ่มต้นและจุดต่อไปเพื่อค้นหารถที่ผ่านตามลำดับ หากเลือกกล้องเดียวกันจะแสดงข้อมูลจากกล้องนั้น หากไม่เลือกจะแสดงข้อมูลทั้งหมด</p>

          {/* เวลา */}
          <div className="flex items-center space-x-4">
            <label className="w-32 font-medium text-gray-700">เวลา :</label>
            <select
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="bg-gray-100 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">เริ่มต้น</option>
              {timeOptions.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
            <select
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="bg-gray-100 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">สิ้นสุด</option>
              {timeOptions.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>

          {/* วันที่ */}
          <div className="flex items-center space-x-4">
            <label className="w-32 font-medium text-gray-700">วันที่ :</label>
            <div className="relative flex-1">
              <input
                type="date"
                className="w-full bg-gray-100 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-center mt-6">
            <button
              type="submit"
              className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600 transition-colors"
            >
              ค้นหา
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-6 bg-red-100 border border-red-400 text-red-700 p-4 rounded-lg shadow-md">
            <p className="font-semibold">{error}</p>
          </div>
        )}

        {isSearched && results.length === 0 && !error && (
          <div className="mt-10 bg-gray-100 border border-gray-300 text-gray-700 p-6 rounded-lg shadow-md text-center">
            <FontAwesomeIcon icon={faExclamationTriangle} className="text-yellow-500 text-2xl mb-2" />
            <p className="font-semibold text-lg">ไม่พบข้อมูลการค้นหา</p>
            <p className="text-sm">กรุณาลองค้นหาด้วยเงื่อนไขอื่น หรือตรวจสอบข้อมูลที่ป้อน</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-10">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold text-gray-700">ผลการค้นหา</h2>
              <div className="space-x-3">
                <CSVLink
                  data={csvData}
                  filename="ผลการค้นหา.csv"
                  className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
                >
                  ส่งออกเป็น CSV
                </CSVLink>
                <button
                  onClick={exportPDF}
                  className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors"
                >
                  ส่งออกเป็น PDF
                </button>
              </div>
            </div>
            <div ref={tableRef} className="bg-white shadow-lg rounded-lg p-6 border border-gray-200">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-gray-700">
                  <thead className="bg-gray-50 text-xs uppercase">
                    <tr>
                      <th className="py-3 px-6 font-semibold border-b whitespace-nowrap text-center">ID</th>
                      <th className="py-3 px-6 font-semibold border-b whitespace-nowrap text-center">ป้ายทะเบียน</th>
                      <th className="py-3 px-6 font-semibold border-b whitespace-nowrap text-center">จังหวัด</th>
                      <th className="py-3 px-6 font-semibold border-b whitespace-nowrap text-center">ชื่อกล้อง</th>
                      <th className="py-3 px-6 font-semibold border-b whitespace-nowrap text-center">วันที่</th>
                      <th className="py-3 px-6 font-semibold border-b whitespace-nowrap text-center">เวลา</th>
                      <th className="py-3 px-6 font-semibold border-b whitespace-nowrap text-center">อยู่ในบัญชีดำ</th>
                      <th className="py-3 px-6 font-semibold border-b whitespace-nowrap text-center">เหตุผลบัญชีดำ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, index) => (
                      <tr
                        key={result.id}
                        className={`border-b hover:bg-gray-50 transition-colors duration-200 ${index % 2 === 0 ? "bg-gray-50" : "bg-white"
                          }`}
                      >
                        <td className="py-4 px-6 text-gray-600 whitespace-nowrap text-center">{result.id}</td>
                        <td className="py-4 px-6 text-gray-600 whitespace-nowrap text-center">{result.license_plate}</td>
                        <td className="py-4 px-6 text-gray-600 whitespace-nowrap text-center">{result.province}</td>
                        <td className="py-4 px-6 text-gray-600 whitespace-nowrap text-center">{result.camera_name}</td>
                        <td className="py-4 px-6 text-gray-600 whitespace-nowrap text-center">{formatDate(result.pass_time)}</td>
                        <td className="py-4 px-6 text-gray-600 whitespace-nowrap text-center">{formatTime(result.pass_time)}</td>
                        <td className="py-4 px-6 text-gray-600 whitespace-nowrap text-center">{result.is_blacklisted ? "ใช่" : "ไม่ใช่"}</td>
                        <td className="py-4 px-6 text-gray-600 whitespace-nowrap text-center">{result.blacklist_reason || "ไม่มี"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}