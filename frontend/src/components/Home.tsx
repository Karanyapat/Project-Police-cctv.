import Navbar from "./Navbar";
import { useState, useEffect } from "react";

function Home() {
  // State สำหรับจัดการสไลด์ปัจจุบัน
  const [currentSlide, setCurrentSlide] = useState(0);

  // รายการสไลด์ (3 รูป placeholder)
  const slides = [
    {
      url: "/1.png",
      title: "ระบบการแสดงผล",
    },
    {
      url: "/2.png",
      title: "การจำลองเส้นทาง",
    },
    {
      url: "/3.png",
      title: "แดชบอร์ดเรียลไทม์",
    },
  ];

  // ฟังก์ชันเลื่อนสไลด์อัตโนมัติทุก 3 วินาที
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev === slides.length - 1 ? 0 : prev + 1));
    }, 3000); // เปลี่ยนทุก 3 วินาที
    return () => clearInterval(interval); // ล้าง interval เมื่อ component unmount
  }, [slides.length]);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Navbar */}
      <Navbar />

      {/* Carousel Hero Section */}
      <div className="relative h-96 overflow-hidden">
        {slides.map((slide, index) => (
          <div
            key={index}
            className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ${
              index === currentSlide ? "opacity-100" : "opacity-0"
            }`}
            style={{ backgroundImage: `url(${slide.url})` }}
          >
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
              <div className="text-center text-white">
                <h1 className="text-5xl md:text-6xl font-bold mb-4">
                  {slide.title}
                </h1>
                <p className="text-lg md:text-xl max-w-2xl mx-auto">
                  ระบบแสดงผลและจำลองการติดตามยานพาหนะ
                </p>
              </div>
            </div>
          </div>
        ))}
        {/* Dots for navigation */}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center space-x-2">
          {slides.map((_, index) => (
            <button
              key={index}
              className={`w-3 h-3 rounded-full ${
                index === currentSlide ? "bg-white" : "bg-gray-400"
              }`}
              onClick={() => setCurrentSlide(index)}
            />
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="py-12">
          {/* Content Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Welcome Card */}
            <div className="bg-white shadow-lg rounded-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
              <img
                src="aboutsystem.png"
                alt="Vehicle Tracking"
                className="w-full h-48 object-cover"
              />
              <div className="p-6">
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">
                  เกี่ยวกับระบบ
                </h2>
                <p className="text-gray-600 leading-relaxed">
                  ระบบนี้ถูกออกแบบมาเพื่อการแสดงผลข้อมูลยานพาหนะ ด้วยการจำลองการเคลื่อนไหวของยานพาหนะและการวิเคราะห์ข้อมูล
                </p>
              </div>
            </div>

            {/* Feature Card */}
            <div className="bg-white shadow-lg rounded-lg p-6 hover:shadow-xl transition-shadow duration-300">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">
                คุณสมบัติเด่น
              </h2>
              <ul className="list-disc list-inside text-gray-600 space-y-2">
                <li>การติดตามยานพาหนะแบบเรียลไทม์</li>
                <li>การจำลองเส้นทางการเคลื่อนที่</li>
                <li>สามารถนำข้อมูลไปวิเคราะห์ได้</li>
                <li>การแจ้งเตือนอัตโนมัติเมื่อเกิดเหตุผิดปกติ</li>
              </ul>
            </div>
          </div>

          {/* Call to Action Section */}
          <div className="mt-12 bg-gradient-to-r from-red-600 to-red-800 text-white rounded-lg p-8 shadow-lg flex items-center">
            <div className="flex-1">
              <h2 className="text-3xl font-bold mb-4">
                เริ่มต้นใช้งานเลย!
              </h2>
              <p className="text-lg leading-relaxed">
                เข้าร่วมเพื่อการติดตามยานพาหนะที่ต้องสงสัยและวิเคราะห์ข้อมูล
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-red-800 text-white py-6 mt-12">
        <div className="max-w-screen-xl mx-auto px-4 text-center">
          <p>© 2025 Vehicle Tracking System. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

export default Home;