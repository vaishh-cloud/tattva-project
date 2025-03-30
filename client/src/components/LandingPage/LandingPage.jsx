import React from "react";
import { useNavigate } from "react-router-dom";
import { FaFileUpload, FaBrain, FaQuestionCircle } from "react-icons/fa";
import logo from "./Insight Paper.png";
import Lottie from "lottie-react";
import animationData from "./Animation.json";
import 'bootstrap/dist/css/bootstrap.min.css';
import './LandingPage.css';

function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      {/* Navigation Bar */}
      <nav className="navbar">
        <div className="container-fluid px-5">
          <div className="logo">
            <img src={logo} alt="Logo" className="logo-img" />
            InsightPaper
          </div>
          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#contact">Contact</a>
            <button className="nav-btn" onClick={(e) => { e.preventDefault(); navigate("/login"); }}>
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="hero">
        <div className="container-fluid">
          <div className="row align-items-center justify-content-center">
            <div className="col-md-6">
              <div className="lottie-animation">
                <Lottie animationData={animationData} loop={true} autoplay={true} />
              </div>
            </div>
            <div className="col-md-6">
              <div className="hero-content">
                <h1>AI-Powered Research Summarization</h1>
                <p>Upload papers, get instant insights, and ask AI-powered questions.</p>
                <div className="btn-container">
                  <button onClick={(e) => { e.preventDefault(); navigate("/Main"); }} className="btn primary-btn">Continue as Guest</button>
                  <button className="btn secondary-btn" onClick={(e) => { e.preventDefault(); navigate("/login"); }}>
                    Sign In or Register
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Features Section */}
      <section id="features" className="features">
        <div className="container">
          <h2>Why Choose InsightPaper?</h2>
          <div className="row feature-grid">
            <div className="col-md-4">
              <div className="feature-item">
                <FaFileUpload className="feature-icon" />
                <h3>Easy Upload</h3>
                <p>Simply upload your research paper in PDF or Docx format.</p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="feature-item">
                <FaBrain className="feature-icon" />
                <h3>AI Summarization</h3>
                <p>Get concise, well-structured summaries with key insights.</p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="feature-item">
                <FaQuestionCircle className="feature-icon" />
                <h3>Interactive Q&A</h3>
                <p>Ask AI follow-up questions on topics of interest.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="how-it-works">
        <div className="container">
          <h2>How It Works</h2>
          <div className="row steps">
            <div className="col-md-4">
              <div className="step">
                <span className="step-number">1</span>
                <h3>Upload Paper</h3>
                <p>Select a research paper to analyze.</p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="step">
                <span className="step-number">2</span>
                <h3>AI Processing</h3>
                <p>Our AI extracts key points, pros & cons.</p>
              </div>
            </div>
            <div className="col-md-4">
              <div className="step">
                <span className="step-number">3</span>
                <h3>Ask AI Questions</h3>
                <p>Interact with AI to explore deeper insights.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact">
        <p>© 2025 InsightPaper | AI-powered research summarization</p>
      </footer>
    </div>
  );
}

export default LandingPage;