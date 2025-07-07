import './App.css';
import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import LandingPage from './components/LandingPage/LandingPage';
import LoginPage from './components/LoginPage/LoginPage';
import Mainpage from './components/Mainpage/Mainpage';

// Retrieve user from localStorage
const user = JSON.parse(localStorage.getItem('user'));

const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingPage />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/Main',
    element: <Mainpage user={user} />, // 👈 Pass user prop here
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
