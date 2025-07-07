import React, { useState } from 'react';
import './LoginPage.css'; // Import CSS for styling the login page
import 'boxicons'; // Import Boxicons for icons (assumes package is installed)

// LoginPage component for handling user authentication
const LoginPage = () => {
  // State to toggle between login and register forms
  const [isActive, setIsActive] = useState(false);
  // State for login form messages (success or error)
  const [loginMessage, setLoginMessage] = useState('');
  const [loginMessageType, setLoginMessageType] = useState(''); // 'success' or 'error'
  // State for register form messages (success or error)
  const [registerMessage, setRegisterMessage] = useState('');
  const [registerMessageType, setRegisterMessageType] = useState(''); // 'success' or 'error'

  // Handle login form submission
  const handleLoginSubmit = async (e) => {
    e.preventDefault(); // Prevent default form submission
    const username = e.target[0].value; // Get username from form
    const password = e.target[1].value; // Get password from form

    // Clear previous login messages
    setLoginMessage('');

    try {
      // Send login request to server
      const response = await fetch("http://localhost:5000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      // Log response for debugging
      console.log("Login response:", response.status, data);

      // Check if login was successful (token received)
      if (data.token) {
        setLoginMessage("Login successful!");
        setLoginMessageType("success");

        // Store token and user data in localStorage
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));

        // Redirect to main page after a short delay
        setTimeout(() => {
          window.location.href = "/Main";
        }, 1000);
      } else {
        // Display error message from server or default
        setLoginMessage(data.message || "Username or password is incorrect");
        setLoginMessageType("error");
      }
    } catch (error) {
      // Handle network or other errors
      console.error("Login error:", error);
      setLoginMessage("Connection error. Please try again later.");
      setLoginMessageType("error");
    }
  };

  // Handle register form submission
  const handleRegisterSubmit = async (e) => {
    e.preventDefault(); // Prevent default form submission
    const username = e.target[0].value; // Get username from form
    const email = e.target[1].value; // Get email from form
    const password = e.target[2].value; // Get password from form

    // Clear previous register messages
    setRegisterMessage('');

    try {
      // Send registration request to server
      const response = await fetch("http://localhost:5000/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password })
      });

      const data = await response.json();

      // Log response for debugging
      console.log("Register response:", response.status, data);

      // Check if registration was successful
      if (response.ok || data.success) {
        setRegisterMessage(data.message || "Registration successful!");
        setRegisterMessageType("success");
      } else {
        // Display error message from server or default
        setRegisterMessage(data.message || "Registration failed. Please try again.");
        setRegisterMessageType("error");
      }
    } catch (error) {
      // Handle network or other errors
      console.error("Registration error:", error);
      setRegisterMessage("Connection error. Please try again later.");
      setRegisterMessageType("error");
    }
  };

  // Render login and register forms
  return (
    <div className="auth-container">
      {/* Wrapper for login/register forms with animation toggle */}
      <div className={`wrapper ${isActive ? 'active' : ''}`}>
        <span className="rotate-bg"></span> {/* Background animation element */}
        <span className="rotate-bg2"></span> {/* Secondary background animation element */}

        {/* Login form */}
        <div className="form-box login">
          <h2 className="animation" style={{ "--i": 0, "--j": 21 }}>Login</h2>
          <form onSubmit={handleLoginSubmit}>
            {/* Username input */}
            <div className="input-box animation" style={{ "--i": 1, "--j": 22 }}>
              <input type="text" required />
              <label>Username</label>
              <i className="bx bxs-user"></i> {/* Username icon */}
            </div>

            {/* Password input */}
            <div className="input-box animation" style={{ "--i": 2, "--j": 23 }}>
              <input type="password" required />
              <label>Password</label>
              <i className="bx bxs-lock-alt"></i> {/* Password icon */}
            </div>

            {/* Display login message (success or error) */}
            {loginMessage && (
              <div
                className={`message-container animation ${loginMessageType}`}
                style={{ "--i": 2.5, "--j": 23.5 }}
              >
                {loginMessage}
              </div>
            )}

            {/* Submit button */}
            <button type="submit" className="btn animation" style={{ "--i": 3, "--j": 24 }}>
              Login
            </button>

            {/* Link to switch to register form */}
            <div className="linkTxt animation" style={{ "--i": 5, "--j": 25 }}>
              <p>
                Don't have an account?{" "}
                <a
                  href="#"
                  className="register-link"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsActive(true); // Switch to register form
                    setLoginMessage(''); // Clear login message
                  }}
                >
                  Sign Up
                </a>
              </p>
            </div>
          </form>
        </div>

        {/* Login info text */}
        <div className="info-text login">
          <h2 className="animation" style={{ "--i": 0, "--j": 20 }}>Welcome Back!</h2>
          <p className="animation" style={{ "--i": 1, "--j": 21 }}>
            Continue your research with AI-powered summarization.
          </p>
        </div>

        {/* Register form */}
        <div className="form-box register">
          <h2 className="animation" style={{ "--i": 17, "--j": 0 }}>Sign Up</h2>
          <form onSubmit={handleRegisterSubmit}>
            {/* Username input */}
            <div className="input-box animation" style={{ "--i": 18, "--j": 1 }}>
              <input type="text" required />
              <label>Username</label>
              <i className="bx bxs-user"></i> {/* Username icon */}
            </div>

            {/* Email input */}
            <div className="input-box animation" style={{ "--i": 19, "--j": 2 }}>
              <input type="email" required />
              <label>Email</label>
              <i className="bx bxs-envelope"></i> {/* Email icon */}
            </div>

            {/* Password input */}
            <div className="input-box animation" style={{ "--i": 20, "--j": 3 }}>
              <input type="password" required />
              <label>Password</label>
              <i className="bx bxs-lock-alt"></i> {/* Password icon */}
            </div>

            {/* Display register message (success or error) */}
            {registerMessage && (
              <div
                className={`message-container animation ${registerMessageType}`}
                style={{ "--i": 20.5, "--j": 3.5 }}
              >
                {registerMessage}
              </div>
            )}

            {/* Submit button */}
            <button type="submit" className="btn animation" style={{ "--i": 21, "--j": 4 }}>
              Sign Up
            </button>

            {/* Link to switch to login form */}
            <div className="linkTxt animation" style={{ "--i": 22, "--j": 5 }}>
              <p>
                Already have an account?{" "}
                <a
                  href="#"
                  className="login-link"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsActive(false); // Switch to login form
                    setRegisterMessage(''); // Clear register message
                  }}
                >
                  Login
                </a>
              </p>
            </div>
          </form>
        </div>

        {/* Register info text */}
        <div className="info-text register">
          <h2 className="animation" style={{ "--i": 17, "--j": 0 }}>Welcome!</h2>
          <p className="animation" style={{ "--i": 18, "--j": 1 }}>
            Create an account to explore AI-powered research insights.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;