import styles from '../styles/Login.module.css';
import React, { useState } from 'react';
import Swal from 'sweetalert2';
import '@fortawesome/fontawesome-free/css/all.min.css';
import Navbar from "../components/Navbar";
import { useRouter } from "next/router";
import axios from 'axios';
import Head from 'next/head';

export default function Login() {
  const router = useRouter();

  const [isLogin, setIsLogin] = useState(true);
  const [Username_login, setUsername_login] = useState("");
  const [Password_login, setPassword_login] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [Username_regis, setUsername_regis] = useState("");
  const [Password_regis, setPassword_regis] = useState("");
  const [conPassword_regis, setconPassword_regis] = useState("");

  const handleSlideChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsLogin(e.target.id === 'login');
  };

  const handleSingup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (Password_regis !== conPassword_regis) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Passwords do not match!',
      });
      return;
    }

    try {
      const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/register`, {
        username: Username_regis,
        password: Password_regis,
      });

      if (response.data && response.data.status === "ok") {
        const form = e.target as HTMLFormElement;
        form.reset();
        Swal.fire({
          icon: 'success',
          title: 'Success',
          text: 'User registered successfully!',
        }).then(() => {
          setIsLogin(true);
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'User already exists.',
          text: 'Please set a new username.',
        });
      }
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'An error occurred during registration.',
      });
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/login`,
        {
          username: Username_login,
          password: Password_login,
        },
        {
          validateStatus: function (status) {
            return status < 500;
          },
        }
      );

      if (response.data && response.data.status === "ok") {
        Swal.fire({
          icon: "success",
          title: "Login Successful",
          text: "You have logged in successfully!",
        });
        localStorage.setItem("@user", JSON.stringify(response.data.user));
        localStorage.setItem("token", response.data.token);
        router.push("/home");
      } else {
        Swal.fire({
          icon: "error",
          title: "Login Failed",
          text: response.data.message || "Invalid username or password.",
        });
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        Swal.fire({
          icon: "error",
          title: "Login Failed",
          text: error.response?.data?.message || "An error occurred during login.",
        });
      } else {
        Swal.fire({
          icon: "error",
          title: "Error",
          text: "An error occurred during login. Please try again later.",
        });
      }
    }
  };

  return (
    <>
      <Head>
        <title>Login & Register</title>
        <meta name="description" content="ยินดีต้อนรับสู่เว็บไซต์ของฉัน" />
        <link rel="icon" href="/police-logo.png" />
      </Head>
      <Navbar />
      <div className={styles.fullscreen}>
        <div className={styles.wrapper}>
          <div className={styles.logo}>
            <img src="/police-logo.png" alt="Logo" />
          </div>

          <div className={styles.titleText}>
            <div className={`${styles.title} ${isLogin ? '' : styles.shiftLeft}`}>เข้าสู่ระบบ</div>
            <div className={`${styles.title} ${isLogin ? styles.shiftRight : ''}`}>สมัครบัญชี</div>
          </div>

          <div className={styles.formContainer}>
            <div className={styles.slideControls}>
              <input
                type="radio"
                name="slide"
                id="login"
                className={styles.radioHidden}
                checked={isLogin}
                onChange={handleSlideChange}
              />
              <input
                type="radio"
                name="slide"
                id="signup"
                className={styles.radioHidden}
                checked={!isLogin}
                onChange={handleSlideChange}
              />
              <label htmlFor="login" className={`${styles.slide} ${isLogin ? styles.active : ''}`}>Login</label>
              <label htmlFor="signup" className={`${styles.slide} ${!isLogin ? styles.active : ''}`}>Register</label>
              <div className={`${styles.sliderTab} ${!isLogin ? styles.shiftTab : ''}`}></div>
            </div>
            <div className={`${styles.formInner} ${!isLogin ? styles.shiftForm : ''}`}>
              <form className={styles.loginForm} onSubmit={handleLogin}>
                <div className={`${styles.field} ${styles.btn}`}>
                  <input
                    type="text"
                    placeholder="Username"
                    required
                    onChange={(e) => setUsername_login(e.target.value)}
                  />
                </div>
                <div className={`${styles.field} ${styles.btn}`} style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    required
                    onChange={(e) => setPassword_login(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="_btn_eye"
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                    }}>
                    {showPassword ? <i className="fa-solid fa-eye-slash"></i> : <i className="fa-solid fa-eye"></i>}
                  </button>
                </div>
                <div className={`${styles.field} ${styles.btn}`}>
                  <div className={styles.btnLayer}></div>
                  <input type="submit" value="Login" />
                </div>
                <div className={styles.signupLink}>
                  Not a member? <a href="#" onClick={(e) => { e.preventDefault(); setIsLogin(false); }}>Register now</a>
                </div>
              </form>

              <form className={styles.signupForm} onSubmit={handleSingup}>
                <div className={`${styles.field} ${styles.btn}`}>
                  <input
                    type="text"
                    placeholder="Username"
                    required
                    onChange={(e) => setUsername_regis(e.target.value)}
                  />
                </div>
                <div className={`${styles.field} ${styles.btn}`} style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    required
                    onChange={(e) => setPassword_regis(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="_btn_eye"
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                    }}>
                    {showPassword ? <i className="fa-solid fa-eye-slash"></i> : <i className="fa-solid fa-eye"></i>}
                  </button>
                </div>
                <div className={`${styles.field} ${styles.btn}`} style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Confirm password"
                    required
                    onChange={(e) => setconPassword_regis(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="_btn_eye"
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                    }}>
                    {showPassword ? <i className="fa-solid fa-eye-slash"></i> : <i className="fa-solid fa-eye"></i>}
                  </button>
                </div>
                <div className={`${styles.field} ${styles.btn}`}>
                  <div className={styles.btnLayer}></div>
                  <input type="submit" value="Signup" />
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}