import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { HomePage } from './pages/HomePage';
import { RoutePage } from './pages/RoutePage';
import { MeetupPage } from './pages/MeetupPage';
import { AboutPage } from './pages/AboutPage';
import { FAQPage } from './pages/FAQPage';

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
        <Header />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/route" element={<RoutePage />} />
          <Route path="/meetup" element={<MeetupPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/faq" element={<FAQPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}