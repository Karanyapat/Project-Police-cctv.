import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUserSecret,
  faRightFromBracket,
  faBinoculars,
  faSearch,
  faHouse,
  faUser,
  faBars,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";

function Navbar() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const user = localStorage.getItem("@user");
    setIsLoggedIn(!!user && user !== "undefined");
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("@user");
    setIsLoggedIn(false);
    router.push("/login" as const); // ระบุ type เป็น string literal
    setIsMenuOpen(false);
  };

  // ระบุ type ของ path เป็น string
  const isActive = (path: string): boolean => router.pathname === path;

  return (
    <nav className="bg-maroon text-white">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-4">
          {/* Logo and Title */}
          <div className="flex items-center space-x-3">
            <img src="/PoliceLogo.png" className="h-10 sm:h-14" alt="Police Logo" />
            <span className="text-xl sm:text-2xl font-semibold">Police-CCTV</span>
          </div>

          {/* Hamburger Button for Mobile */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-white focus:outline-none"
            >
              <FontAwesomeIcon icon={isMenuOpen ? faTimes : faBars} size="lg" />
            </button>
          </div>

          {/* Navbar Links - Desktop */}
          <div className="hidden md:flex md:items-center md:space-x-6">
            <ul className="flex space-x-6">
              {!isLoggedIn && (
                <>
                  <li className="relative">
                    <Link
                      href="/"
                      className={`hover:text-gold transition-colors duration-200 flex items-center ${
                        isActive("/") ? "text-gold" : ""
                      }`}
                    >
                      <FontAwesomeIcon icon={faHouse} className="mr-1" />
                      Home
                      {isActive("/") && (
                        <span className="absolute -bottom-1 left-0 w-full h-1 bg-gold rounded-full active-underline transition-transform duration-300 origin-left scale-x-100"></span>
                      )}
                    </Link>
                  </li>
                  <li className="relative">
                    <Link
                      href="/login"
                      className={`hover:text-gold transition-colors duration-200 flex items-center ${
                        isActive("/login") ? "text-gold" : ""
                      }`}
                    >
                      <FontAwesomeIcon icon={faUser} className="mr-1" />
                      Login & Register
                      {isActive("/login") && (
                        <span className="absolute -bottom-1 left-0 w-full h-1 bg-gold rounded-full active-underline transition-transform duration-300 origin-left scale-x-100"></span>
                      )}
                    </Link>
                  </li>
                </>
              )}
              {isLoggedIn && (
                <>
                  <li className="relative">
                    <Link
                      href="/home"
                      className={`hover:text-gold transition-colors duration-200 flex items-center ${
                        isActive("/home") ? "text-gold" : ""
                      }`}
                    >
                      <FontAwesomeIcon icon={faBinoculars} className="mr-1" />
                      CCTV
                      {isActive("/home") && (
                        <span className="absolute -bottom-1 left-0 w-full h-1 bg-gold rounded-full active-underline transition-transform duration-300 origin-left scale-x-100"></span>
                      )}
                    </Link>
                  </li>
                  <li className="relative">
                    <Link
                      href="/blacklist"
                      className={`hover:text-gold transition-colors duration-200 flex items-center ${
                        isActive("/blacklist") ? "text-gold" : ""
                      }`}
                    >
                      <FontAwesomeIcon icon={faUserSecret} className="mr-1" />
                      Blacklist
                      {isActive("/blacklist") && (
                        <span className="absolute -bottom-1 left-0 w-full h-1 bg-gold rounded-full active-underline transition-transform duration-300 origin-left scale-x-100"></span>
                      )}
                    </Link>
                  </li>
                  <li className="relative">
                    <Link
                      href="/search"
                      className={`hover:text-gold transition-colors duration-200 flex items-center ${
                        isActive("/search") ? "text-gold" : ""
                      }`}
                    >
                      <FontAwesomeIcon icon={faSearch} className="mr-1" />
                      Search
                      {isActive("/search") && (
                        <span className="absolute -bottom-1 left-0 w-full h-1 bg-gold rounded-full active-underline transition-transform duration-300 origin-left scale-x-100"></span>
                      )}
                    </Link>
                  </li>
                  <li className="relative">
                    <a
                      onClick={handleLogout}
                      className={`hover:text-gold cursor-pointer transition-colors duration-200 flex items-center ${
                        isActive("/login") ? "text-gold" : ""
                      }`}
                    >
                      <FontAwesomeIcon icon={faRightFromBracket} className="mr-1" />
                      Logout
                      {isActive("/login") && (
                        <span className="absolute -bottom-1 left-0 w-full h-1 bg-gold rounded-full active-underline transition-transform duration-300 origin-left scale-x-100"></span>
                      )}
                    </a>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>

        {/* Mobile Menu with Smooth Transition */}
        <div
          className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
            isMenuOpen ? "max-h-96" : "max-h-0"
          }`}
        >
          <ul className="flex flex-col space-y-4 px-4 pb-4">
            {!isLoggedIn && (
              <>
                <li className="relative">
                  <Link
                    href="/"
                    className={`hover:text-gold block transition-colors duration-200 ${
                      isActive("/") ? "text-gold" : ""
                    }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <FontAwesomeIcon icon={faHouse} className="mr-1" />
                    Home
                    {isActive("/") && (
                      <span className="absolute -bottom-1 left-0 w-full h-1 bg-gold rounded-full active-underline transition-transform duration-300 origin-left scale-x-100"></span>
                    )}
                  </Link>
                </li>
                <li className="relative">
                  <Link
                    href="/login"
                    className={`hover:text-gold block transition-colors duration-200 ${
                      isActive("/login") ? "text-gold" : ""
                    }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <FontAwesomeIcon icon={faUser} className="mr-1" />
                    Login & Register
                    {isActive("/login") && (
                      <span className="absolute -bottom-1 left-0 w-full h-1 bg-gold rounded-full active-underline transition-transform duration-300 origin-left scale-x-100"></span>
                    )}
                  </Link>
                </li>
              </>
            )}
            {isLoggedIn && (
              <>
                <li className="relative">
                  <Link
                    href="/home"
                    className={`hover:text-gold block transition-colors duration-200 ${
                      isActive("/home") ? "text-gold" : ""
                    }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <FontAwesomeIcon icon={faBinoculars} className="mr-1" />
                    CCTV
                    {isActive("/home") && (
                      <span className="absolute -bottom-1 left-0 w-full h-1 bg-gold rounded-full active-underline transition-transform duration-300 origin-left scale-x-100"></span>
                    )}
                  </Link>
                </li>
                <li className="relative">
                  <Link
                    href="/blacklist"
                    className={`hover:text-gold block transition-colors duration-200 ${
                      isActive("/blacklist") ? "text-gold" : ""
                    }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <FontAwesomeIcon icon={faUserSecret} className="mr-1" />
                    Blacklist
                    {isActive("/blacklist") && (
                      <span className="absolute -bottom-1 left-0 w-full h-1 bg-gold rounded-full active-underline transition-transform duration-300 origin-left scale-x-100"></span>
                    )}
                  </Link>
                </li>
                <li className="relative">
                  <Link
                    href="/search"
                    className={`hover:text-gold block transition-colors duration-200 ${
                      isActive("/search") ? "text-gold" : ""
                    }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <FontAwesomeIcon icon={faSearch} className="mr-1" />
                    Search
                    {isActive("/search") && (
                      <span className="absolute -bottom-1 left-0 w-full h-1 bg-gold rounded-full active-underline transition-transform duration-300 origin-left scale-x-100"></span>
                    )}
                  </Link>
                </li>
                <li className="relative">
                  <a
                    onClick={handleLogout}
                    className={`hover:text-gold cursor-pointer block transition-colors duration-200 ${
                      isActive("/login") ? "text-gold" : ""
                    }`}
                  >
                    <FontAwesomeIcon icon={faRightFromBracket} className="mr-1" />
                    Logout
                    {isActive("/login") && (
                      <span className="absolute -bottom-1 left-0 w-full h-1 bg-gold rounded-full active-underline transition-transform duration-300 origin-left scale-x-100"></span>
                    )}
                  </a>
                </li>
              </>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;