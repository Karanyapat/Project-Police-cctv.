import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import Navbar from "../components/Navbar";
import { io } from "socket.io-client";
import Head from 'next/head';

// อินเตอร์เฟซสำหรับ Blacklist
interface BlacklistItem {
  id: string;
  license_plate: string;
  province: string;
  license_plate_img_path?: string;
  vehicle_type: string;
  vehicle_color: string;
  vehicle_brand: string;
  reason: string;
  added_at: string;
}

export default function Blacklist() {
  const router = useRouter();
  const [blacklist, setBlacklist] = useState<BlacklistItem[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  // ฟิลเตอร์ข้อมูล Blacklist ตามคำค้นหา
  const filteredBlacklist = Array.isArray(blacklist)
    ? blacklist.filter((item) =>
      search
        ? Object.values(item).some((value) =>
          value?.toString().toLowerCase().includes(search.toLowerCase())
        )
        : true
    )
    : [];

  // Pagination Logic
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(5);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredBlacklist.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredBlacklist.length / itemsPerPage);

  const goToNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
  const renderPageNumbers = pageNumbers.map((number) => (
    <button
      key={number}
      onClick={() => setCurrentPage(number)}
      className={`px-3 py-1 mx-1 rounded transition-colors duration-200 ${currentPage === number ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
        }`}
    >
      {number}
    </button>
  ));

  const [newBlacklist, setNewBlacklist] = useState<BlacklistItem>({
    id: "",
    license_plate: "",
    province: "",
    license_plate_img_path: "",
    vehicle_type: "",
    vehicle_color: "",
    vehicle_brand: "",
    reason: "",
    added_at: "",
  });
  const [editingBlacklist, setEditingBlacklist] = useState<BlacklistItem | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedImageName, setSelectedImageName] = useState<string | null>(null);

  // Fetch Blacklist Data
  const fetchBlacklist = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("Token ไม่พบ! กรุณาล็อกอินใหม่.");
        setLoading(false);
        return;
      }
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/blacklist`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.status === "ok") {
        setBlacklist(Array.isArray(data.blacklist) ? data.blacklist : []);
      } else {
        setError(data.message || "ไม่สามารถดึงข้อมูลได้");
      }
    } catch (err: any) {
      setError("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // WebSocket Connection
  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_API_URL || "", {
      transports: ["websocket"],
    });
    socket.on("blacklist_updated", (updatedBlacklist: BlacklistItem[]) => {
      fetchBlacklist();
    });
    socket.on("alert_match", (alertData: { vehicle: any; blacklistItem: BlacklistItem }) => {
      Swal.fire({
        title: "แจ้งเตือน!",
        html: `
          <p>พบรถที่อาจตรงกับ Blacklist:</p>
          <p>ป้ายทะเบียน: ${alertData.vehicle.license_plate}</p>
          <p>จังหวัด: ${alertData.vehicle.province}</p>
          <p>ตรงกับ Blacklist: ${alertData.blacklistItem.license_plate} (${alertData.blacklistItem.reason})</p>
        `,
        icon: "warning",
        confirmButtonText: "ตกลง",
      });
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  // Fetch initial data from /blacklist
  useEffect(() => {
    const user = localStorage.getItem("@user");
    if (!user) {
      router.push("/login");
      return;
    }
    fetchBlacklist();
  }, [router]);

  // Modal Functions
  const openAddModal = () => {
    setNewBlacklist({
      id: "",
      license_plate: "",
      province: "",
      license_plate_img_path: "",
      vehicle_type: "",
      vehicle_color: "",
      vehicle_brand: "",
      reason: "",
      added_at: "",
    });
    setSelectedImage(null);
    setSelectedImageName(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (item: BlacklistItem) => {
    setEditingBlacklist({ ...item });
    setSelectedImage(null);
    setSelectedImageName(null);
    setIsEditModalOpen(true);
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    setNewBlacklist({
      id: "",
      license_plate: "",
      province: "",
      license_plate_img_path: "",
      vehicle_type: "",
      vehicle_color: "",
      vehicle_brand: "",
      reason: "",
      added_at: "",
    });
    setSelectedImage(null);
    setSelectedImageName(null);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditingBlacklist(null);
    setSelectedImage(null);
    setSelectedImageName(null);
  };

  const openImageModal = (imageUrl: string) => {
    setSelectedImageUrl(imageUrl);
    setIsImageModalOpen(true);
  };

  const closeImageModal = () => {
    setIsImageModalOpen(false);
    setSelectedImageUrl(null);
  };

  // Add to Blacklist
  const handleAddBlacklist = async () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Token ไม่พบ! กรุณาล็อกอินใหม่.");
      setLoading(false);
      return;
    }

    const { license_plate, province, vehicle_type, vehicle_color, vehicle_brand, reason } = newBlacklist;
    if (!license_plate || !province || !vehicle_type || !vehicle_color || !vehicle_brand || !reason) {
      setError("กรุณากรอกข้อมูลให้ครบทุกช่อง");
      setLoading(false);
      return;
    }

    const existingBlacklist = blacklist.find(
      (item) => item.license_plate.toLowerCase() === license_plate.toLowerCase()
    );
    if (existingBlacklist) {
      setError("ป้ายทะเบียนนี้มีอยู่ในระบบแล้ว!");
      setLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append("license_plate", newBlacklist.license_plate);
    formData.append("province", newBlacklist.province);
    formData.append("vehicle_type", newBlacklist.vehicle_type);
    formData.append("vehicle_color", newBlacklist.vehicle_color);
    formData.append("vehicle_brand", newBlacklist.vehicle_brand);
    formData.append("reason", newBlacklist.reason);
    if (selectedImage) {
      formData.append("license_plate_img", selectedImage);
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/blacklist`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (data.status === "ok") {
        await fetchBlacklist();
        closeAddModal();
        Swal.fire("สำเร็จ!", "เพิ่มยานพาหนะใน Blacklist เรียบร้อย", "success");
      } else {
        setError(data.message || "ไม่สามารถเพิ่มข้อมูลได้");
      }
    } catch (err: any) {
      setError("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Edit Blacklist
  const submitEditBlacklist = async () => {
    if (!editingBlacklist) return;

    setLoading(true);
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Token ไม่พบ! กรุณาล็อกอินใหม่.");
      setLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append("license_plate", editingBlacklist.license_plate);
    formData.append("province", editingBlacklist.province);
    formData.append("vehicle_type", editingBlacklist.vehicle_type);
    formData.append("vehicle_color", editingBlacklist.vehicle_color);
    formData.append("vehicle_brand", editingBlacklist.vehicle_brand);
    formData.append("reason", editingBlacklist.reason);
    if (selectedImage) {
      formData.append("license_plate_img", selectedImage);
    } else {
      // ส่ง license_plate_img_path เดิมไปทุกครั้งเพื่อให้ API รักษารูปภาพเดิม
      if (editingBlacklist.license_plate_img_path) {
        formData.append("license_plate_img_path", editingBlacklist.license_plate_img_path);
      }
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/blacklist/${editingBlacklist.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (data.status === "ok") {
        await fetchBlacklist();
        closeEditModal();
        Swal.fire("สำเร็จ!", "แก้ไขข้อมูล Blacklist เรียบร้อย", "success");
      } else {
        setError(data.message || "ไม่สามารถแก้ไขข้อมูลได้");
        if (data.message && data.message.includes("image")) {
          Swal.fire("คำเตือน!", "รูปภาพอาจถูกลบเนื่องจากปัญหาการอัปเดต", "warning");
        }
      }
    } catch (err: any) {
      setError("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete from Blacklist
  const handleDeleteBlacklist = async (id: string) => {
    const itemToDelete = blacklist.find((v) => v.id === id);
    const licensePlate = itemToDelete ? itemToDelete.license_plate : "unknown";

    const confirmResult = await Swal.fire({
      title: "คุณแน่ใจหรือไม่?",
      text: `คุณต้องการลบยานพาหนะทะเบียน ${licensePlate} ออกจาก Blacklist หรือไม่?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "ลบ",
      cancelButtonText: "ยกเลิก",
    });

    if (!confirmResult.isConfirmed) return;

    const token = localStorage.getItem("token");
    if (!token) {
      setError("Token ไม่พบ! กรุณาล็อกอินใหม่.");
      return;
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/blacklist/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.status === "ok") {
        setBlacklist((prev) => prev.filter((v) => v.id !== id));
        Swal.fire("สำเร็จ!", "ลบข้อมูล Blacklist เรียบร้อย", "success");
      } else {
        setError(data.message || "ไม่สามารถลบข้อมูลได้");
      }
    } catch (err: any) {
      setError("เกิดข้อผิดพลาด: " + err.message);
    }
  };

  const provinces = [
    "กรุงเทพมหานคร", "สมุทรปราการ", "นนทบุรี", "ปทุมธานี", "พระนครศรีอยุธยา",
    "อ่างทอง", "ลพบุรี", "สิงห์บุรี", "ชัยนาท", "สระบุรี", "ชลบุรี", "ระยอง",
    "จันทบุรี", "ตราด", "ฉะเชิงเทรา", "ปราจีนบุรี", "นครนายก", "สระแก้ว",
    "นครราชสีมา", "บุรีรัมย์", "สุรินทร์", "ศรีสะเกษ", "อุบลราชธานี", "ยโสธร",
    "ชัยภูมิ", "อำนาจเจริญ", "บึงกาฬ", "หนองบัวลำภู", "ขอนแก่น", "อุดรธานี",
    "เลย", "หนองคาย", "มหาสารคาม", "ร้อยเอ็ด", "กาฬสินธุ์", "สกลนคร", "นครพนม",
    "มุกดาหาร", "เชียงใหม่", "ลำพูน", "ลำปาง", "อุตรดิตถ์", "แพร่", "น่าน",
    "พะเยา", "เชียงราย", "แม่ฮ่องสอน", "นครสวรรค์", "อุทัยธานี", "กำแพงเพชร",
    "ตาก", "สุโขทัย", "พิษณุโลก", "พิจิตร", "เพชรบูรณ์", "ราชบุรี", "กาญจนบุรี",
    "สุพรรณบุรี", "นครปฐม", "สมุทรสาคร", "สมุทรสงคราม", "เพชรบุรี", "ประจวบคีรีขันธ์",
    "ชุมพร", "สุราษฎร์ธานี", "นครศรีธรรมราช", "กระบี่", "พังงา", "ภูเก็ต", "ระนอง",
    "สตูล", "ตรัง", "พัทลุง", "ปัตตานี", "ยะลา", "นราธิวาส"
  ].sort((a, b) => a.localeCompare(b, "th"));

  const vehicleTypes = [
    "รถยนต์", "รถตู้", "รถบรรทุก", "รถจักรยานยนต์", "รถบัส", "รถโดยสาร", "รถสามล้อ", "รถอื่น ๆ"
  ];

  const vehicleColors = [
    "ขาว", "ดำ", "แดง", "น้ำเงิน", "เขียว", "เหลือง", "เทา", "เงิน", "ทอง", "ส้ม", "น้ำตาล", "ชมพู", "ม่วง", "อื่น ๆ"
  ];

  const vehicleBrands = [
    "Toyota", "Honda", "Nissan", "Mazda", "Mitsubishi", "Isuzu", "Ford", "Chevrolet", "Suzuki", "Hyundai",
    "Kia", "BMW", "Mercedes-Benz", "Volkswagen", "Yamaha", "Kawasaki", "Ducati", "อื่น ๆ"
  ];

  return (
    <>
      <Head>
        <title>Blacklist</title>
        <link rel="icon" href="/police-logo.png" />
      </Head>
      <Navbar />
      <div className="max-w-7xl mx-auto mt-10 px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Blacklist Management</h1>
          <button
            className="bg-blue-600 text-white px-5 py-2 rounded-lg shadow hover:bg-blue-700 transition-colors duration-200"
            onClick={openAddModal}
          >
            + Add Item
          </button>
        </div>
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search by license plate, province, etc..."
            className="border rounded-lg px-4 py-2 w-full sm:w-1/3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {loading ? (
          <div className="text-center py-4 text-gray-500">กำลังโหลดข้อมูล...</div>
        ) : error ? (
          <div className="text-red-500 text-center py-4 bg-red-100 rounded-lg">{error}</div>
        ) : (
          <>
            <div className="overflow-x-auto bg-white shadow-md rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">เลขป้ายทะเบียน</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">จังหวัด</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ภาพป้ายทะเบียน</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ประเภทยานพาหนะ</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">สียานพาหนะ</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ยี่ห้อยานพาหนะ</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">เหตุผล</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">วันที่เพิ่ม</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {currentItems.length > 0 ? (
                    currentItems.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.license_plate}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.province}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {item.license_plate_img_path ? (
                            <img
                              src={`${process.env.NEXT_PUBLIC_API_URL}/api/uploads/${item.license_plate_img_path}?t=${Date.now()}`}
                              alt="License Plate"
                              className="w-20 h-auto rounded cursor-pointer"
                              onClick={() => openImageModal(`${process.env.NEXT_PUBLIC_API_URL}/api/uploads/${item.license_plate_img_path}?t=${Date.now()}`)}
                              onError={(e) => {
                                console.error("Image failed to load:", e);
                                (e.target as HTMLImageElement).src = `${process.env.NEXT_PUBLIC_API_URL}/api/uploads/${item.license_plate_img_path}?t=${Date.now() + 1}`;
                              }}
                            />
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.vehicle_type}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.vehicle_color}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.vehicle_brand}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.reason}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(item.added_at).toLocaleString("th-TH")}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            className="bg-yellow-500 text-white px-3 py-1 rounded mr-2 hover:bg-yellow-600 transition-colors duration-200"
                            onClick={() => openEditModal(item)}
                          >
                            Edit
                          </button>
                          <button
                            className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 transition-colors duration-200"
                            onClick={() => handleDeleteBlacklist(item.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-6 py-4 text-center text-sm text-gray-500">
                        ไม่มีข้อมูล
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-center mt-6">
              <button
                onClick={goToPreviousPage}
                disabled={currentPage === 1}
                className={`px-3 py-1 mx-1 rounded transition-colors duration-200 ${currentPage === 1 ? "bg-gray-300 cursor-not-allowed" : "bg-gray-200 hover:bg-gray-300"
                  }`}
              >
                {"<<"}
              </button>
              {renderPageNumbers}
              <button
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                className={`px-3 py-1 mx-1 rounded transition-colors duration-200 ${currentPage === totalPages ? "bg-gray-300 cursor-not-allowed" : "bg-gray-200 hover:bg-gray-300"
                  }`}
              >
                {">>"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Modal Add */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-50 flex justify-center items-center">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-gray-800">เพิ่มยานพาหนะใหม่ใน Blacklist</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">เลขป้ายทะเบียน</label>
                <input
                  type="text"
                  placeholder="เลขป้ายทะเบียน"
                  value={newBlacklist.license_plate}
                  onChange={(e) =>
                    setNewBlacklist((prev) => ({ ...prev, license_plate: e.target.value }))
                  }
                  className="border rounded-lg w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">จังหวัด</label>
                <select
                  value={newBlacklist.province}
                  onChange={(e) =>
                    setNewBlacklist((prev) => ({ ...prev, province: e.target.value }))
                  }
                  className="border rounded-lg w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">เลือกจังหวัด</option>
                  {provinces.map((province) => (
                    <option key={province} value={province}>
                      {province}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">ประเภทรถ</label>
                <select
                  value={newBlacklist.vehicle_type}
                  onChange={(e) =>
                    setNewBlacklist((prev) => ({ ...prev, vehicle_type: e.target.value }))
                  }
                  className="border rounded-lg w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">เลือกประเภทรถ</option>
                  {vehicleTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">สีรถ</label>
                <select
                  value={newBlacklist.vehicle_color}
                  onChange={(e) =>
                    setNewBlacklist((prev) => ({ ...prev, vehicle_color: e.target.value }))
                  }
                  className="border rounded-lg w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">เลือกสีรถ</option>
                  {vehicleColors.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">ยี่ห้อรถ</label>
                <select
                  value={newBlacklist.vehicle_brand}
                  onChange={(e) =>
                    setNewBlacklist((prev) => ({ ...prev, vehicle_brand: e.target.value }))
                  }
                  className="border rounded-lg w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">เลือกยี่ห้อรถ</option>
                  {vehicleBrands.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">ภาพแผ่นป้ายทะเบียน</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files ? e.target.files[0] : null;
                    setSelectedImage(file);
                    setSelectedImageName(file ? file.name : null);
                  }}
                  className="border rounded-lg w-full px-3 py-2"
                />
                {selectedImageName && (
                  <p className="mt-2 text-sm text-gray-600">ไฟล์ที่เลือก: {selectedImageName}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700">เหตุผลที่อยู่ใน Blacklist</label>
                <input
                  type="text"
                  placeholder="เหตุผล"
                  value={newBlacklist.reason}
                  onChange={(e) =>
                    setNewBlacklist((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  className="border rounded-lg w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end mt-6 space-x-3">
              <button
                className="bg-gray-400 text-white px-4 py-2 rounded-lg hover:bg-gray-500 transition-colors duration-200"
                onClick={closeAddModal}
              >
                ยกเลิก
              </button>
              <button
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200"
                onClick={handleAddBlacklist}
              >
                เพิ่ม
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit */}
      {isEditModalOpen && editingBlacklist && (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-50 flex justify-center items-center">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-gray-800">แก้ไขยานพาหนะใน Blacklist</h2>
            <form>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1 text-gray-700">เลขป้ายทะเบียน</label>
                <input
                  type="text"
                  className="border rounded-lg w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editingBlacklist.license_plate}
                  onChange={(e) =>
                    setEditingBlacklist((prev) => ({
                      ...prev!,
                      license_plate: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1 text-gray-700">จังหวัด</label>
                <select
                  value={editingBlacklist.province}
                  onChange={(e) =>
                    setEditingBlacklist((prev) => ({
                      ...prev!,
                      province: e.target.value,
                    }))
                  }
                  className="border rounded-lg w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">เลือกจังหวัด</option>
                  {provinces.map((province) => (
                    <option key={province} value={province}>
                      {province}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1 text-gray-700">ประเภทรถ</label>
                <select
                  value={editingBlacklist.vehicle_type}
                  onChange={(e) =>
                    setEditingBlacklist((prev) => ({
                      ...prev!,
                      vehicle_type: e.target.value,
                    }))
                  }
                  className="border rounded-lg w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">เลือกประเภทรถ</option>
                  {vehicleTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1 text-gray-700">สีรถ</label>
                <select
                  value={editingBlacklist.vehicle_color}
                  onChange={(e) =>
                    setEditingBlacklist((prev) => ({
                      ...prev!,
                      vehicle_color: e.target.value,
                    }))
                  }
                  className="border rounded-lg w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">เลือกสีรถ</option>
                  {vehicleColors.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1 text-gray-700">ยี่ห้อรถ</label>
                <select
                  value={editingBlacklist.vehicle_brand}
                  onChange={(e) =>
                    setEditingBlacklist((prev) => ({
                      ...prev!,
                      vehicle_brand: e.target.value,
                    }))
                  }
                  className="border rounded-lg w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">เลือกยี่ห้อรถ</option>
                  {vehicleBrands.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1 text-gray-700">ภาพแผ่นป้ายทะเบียน</label>
                {editingBlacklist.license_plate_img_path && !selectedImage && (
                  <div className="mb-2">
                    <p className="text-sm text-gray-600">รูปภาพปัจจุบัน:</p>
                    <img
                      src={`${process.env.NEXT_PUBLIC_API_URL}/api/uploads/${editingBlacklist.license_plate_img_path}?t=${Date.now()}`}
                      alt="Current License Plate"
                      className="w-20 h-auto rounded"
                    />
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files ? e.target.files[0] : null;
                    setSelectedImage(file);
                    setSelectedImageName(file ? file.name : null);
                  }}
                  className="border rounded-lg w-full px-3 py-2"
                />
                {selectedImageName && (
                  <p className="mt-2 text-sm text-gray-600">ไฟล์ที่เลือก: {selectedImageName}</p>
                )}
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1 text-gray-700">เหตุผลที่อยู่ใน Blacklist</label>
                <input
                  type="text"
                  className="border rounded-lg w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={editingBlacklist.reason}
                  onChange={(e) =>
                    setEditingBlacklist((prev) => ({
                      ...prev!,
                      reason: e.target.value,
                    }))
                  }
                />
              </div>
            </form>
            <div className="flex justify-end mt-6 space-x-3">
              <button
                className="bg-gray-400 text-white px-4 py-2 rounded-lg hover:bg-gray-500 transition-colors duration-200"
                onClick={closeEditModal}
              >
                ยกเลิก
              </button>
              <button
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200"
                onClick={submitEditBlacklist}
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal View Image */}
      {isImageModalOpen && selectedImageUrl && (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex justify-center items-center z-50">
          <div className="relative bg-white p-4 rounded-lg shadow-lg max-w-3xl w-full">
            <button
              className="absolute top-2 right-2 bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 transition-colors duration-200"
              onClick={closeImageModal}
            >
              ปิด
            </button>
            <h2 className="text-xl font-bold mb-4 text-gray-800">รูปภาพป้ายทะเบียน</h2>
            <img
              src={selectedImageUrl}
              alt="License Plate Large View"
              className="w-full h-auto rounded"
            />
          </div>
        </div>
      )}
    </>
  );
}