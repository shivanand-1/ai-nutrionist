"use client";

import React, { useState, useRef, ChangeEvent, useEffect } from "react";
import axios from "axios";
import { 
  UploadCloud, Image as ImageIcon, Loader2, Info, Calculator, 
  AlertCircle, Activity, Sparkles, X, PlusCircle, Zap, Target, Save, Clock
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Detection {
  class_name: string;
  confidence: number;
  bbox: [number, number, number, number];
  calories_per_100g: number;
}

interface FoodItem {
  id: string;
  className: string;
  confidence?: number;
  caloriesPer100g: number;
  weightGrams: number;
  calculatedCalories: number;
  isCalculating: boolean;
}

interface DailySummary {
  total_today: number;
  goal: number;
  remaining: number;
  suggestion: string;
}

interface LogEntry {
  id: number;
  timestamp: string;
  food_name: string;
  calories_per_100g: number;
  weight_grams: number;
  total_calories: number;
}

const API_URL = "http://localhost:8000";

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [isLogging, setIsLogging] = useState(false);

  const fetchLogs = async () => {
    try {
      const res = await axios.get(`${API_URL}/logs`);
      if (res.data.status === "success") {
        setLogs(res.data.logs);
        setDailySummary(res.data.daily_summary);
      }
    } catch (e) {
      console.error("Failed to fetch logs", e);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setImagePreviewUrl(URL.createObjectURL(file));
      setDetections([]);
      setFoodItems([]);
      setError(null);
    }
  };

  const processImage = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setError(null);
    setDetections([]);
    setFoodItems([]);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await axios.post(`${API_URL}/detect`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (response.data.status === "success") {
        const detResult: Detection[] = response.data.detections;
        setDetections(detResult);
        
        const initialFoods = await Promise.all(detResult.map(async (det, idx) => {
          let calculatedCals = det.calories_per_100g;
          try {
            const calcRes = await axios.post(`${API_URL}/calculate?class_name=${det.class_name}&weight_grams=100`);
            if (calcRes.data.status === "success") calculatedCals = calcRes.data.total_calories;
          } catch (e) {
            console.error("Calculate API failed");
          }
          return {
            id: `det-${idx}-${Date.now()}`,
            className: det.class_name,
            confidence: det.confidence,
            caloriesPer100g: det.calories_per_100g,
            weightGrams: 100,
            calculatedCalories: calculatedCals,
            isCalculating: false
          };
        }));
        
        setFoodItems(initialFoods);
      } else {
        setError("Failed to process image.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || "Backend communication error. Is the FastAPI server running?");
    } finally {
      setIsUploading(false);
    }
  };

  const handleWeightChange = async (id: string, newWeightStr: string) => {
    const newWeight = parseFloat(newWeightStr);
    
    setFoodItems(items => items.map(item => 
      item.id === id ? { ...item, weightGrams: isNaN(newWeight) ? 0 : newWeight, isCalculating: true } : item
    ));

    if (isNaN(newWeight)) return;
    const item = foodItems.find(i => i.id === id);
    if (!item) return;

    try {
      const res = await axios.post(`${API_URL}/calculate?class_name=${item.className}&weight_grams=${newWeight}`);
      if (res.data.status === "success") {
        setFoodItems(items => items.map(i => 
          i.id === id ? { ...i, calculatedCalories: res.data.total_calories, isCalculating: false } : i
        ));
      }
    } catch (err) {
       setFoodItems(items => items.map(i => 
          i.id === id ? { ...i, calculatedCalories: (i.caloriesPer100g / 100) * newWeight, isCalculating: false } : i
        ));
    }
  };

  const handleAddManualInput = () => {
    setFoodItems([...foodItems, {
      id: `manual-${Date.now()}`,
      className: "Apple", 
      caloriesPer100g: 52,
      weightGrams: 100,
      calculatedCalories: 52,
      isCalculating: false
    }]);
  };
  
  const handleManualNameChange = async (id: string, newName: string) => {
    setFoodItems(items => items.map(i => i.id === id ? { ...i, className: newName, isCalculating: true } : i));
    const item = foodItems.find(i => i.id === id);
    
    try {
      const weight = item?.weightGrams || 100;
      const res = await axios.post(`${API_URL}/calculate?class_name=${newName}&weight_grams=${weight}`);
      if (res.data.status === "success") {
        setFoodItems(items => items.map(i => 
          i.id === id ? { ...i, calculatedCalories: res.data.total_calories, isCalculating: false } : i
        ));
      }
    } catch (err) {
       setFoodItems(items => items.map(i => i.id === id ? { ...i, isCalculating: false } : i));
    }
  };

  const handleRemoveItem = (id: string) => {
    setFoodItems(items => items.filter(i => i.id !== id));
  };

  const handleSaveLog = async () => {
    if (foodItems.length === 0) return;
    setIsLogging(true);
    try {
      const entries = foodItems.map(item => ({
        food_name: item.className,
        calories_per_100g: item.caloriesPer100g,
        weight_grams: item.weightGrams,
        total_calories: item.calculatedCalories
      }));
      await axios.post(`${API_URL}/log`, entries);
      setFoodItems([]); 
      setImagePreviewUrl(null); 
      setDetections([]);
      await fetchLogs(); 
    } catch (error) {
      console.error(error);
      alert("Failed to save meal to logs.");
    } finally {
      setIsLogging(false);
    }
  }

  const totalCalories = foodItems.reduce((acc, item) => acc + item.calculatedCalories, 0);

  // Animation variants
  const containerVars = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };
  
  const itemVars = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-indigo-500/30 overflow-x-hidden relative pb-12">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/10 blur-[150px] mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-fuchsia-600/10 blur-[150px] mix-blend-screen pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#050505]/60 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Activity className="text-white w-5 h-5" />
            </div>
            <h1 className="font-extrabold text-2xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
              Nutri<span className="text-indigo-400">Vision</span>
            </h1>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10 shadow-inner backdrop-blur-md">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-semibold tracking-wider text-neutral-300 uppercase">Engine Online</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12 relative z-10">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
          
          {/* LEFT COLUMN: MEAL ANALYSIS & RECENT LOGS */}
          <div className="xl:col-span-7 flex flex-col gap-8">
            {/* Analyzer */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="relative p-[1px] rounded-[2rem] bg-gradient-to-b from-white/15 to-transparent overflow-hidden shadow-2xl"
            >
              <div className="bg-[#0a0a0a] rounded-[2rem] p-8 h-full">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight mb-1">Analyze Meal</h2>
                    <p className="text-neutral-500 text-sm">Upload a photo to detect food and estimate calories automatically.</p>
                  </div>
                  {imagePreviewUrl && (
                    <button
                      onClick={() => {
                        setImagePreviewUrl(null);
                        setDetections([]);
                        setSelectedFile(null);
                        setFoodItems([]);
                      }}
                      className="bg-white/5 hover:bg-white/10 text-neutral-300 text-sm px-5 py-2.5 rounded-full transition-all duration-300 font-medium border border-white/10 flex items-center gap-2"
                    >
                      <X className="w-4 h-4" /> Clear
                    </button>
                  )}
                </div>
                
                {!imagePreviewUrl ? (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-96 border-2 border-dashed border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-fuchsia-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="p-5 rounded-3xl bg-white/5 group-hover:bg-indigo-500/20 group-hover:scale-110 mb-6 transition-all duration-500 ease-out shadow-xl backdrop-blur-md border border-white/5">
                      <UploadCloud className="w-10 h-10 text-neutral-400 group-hover:text-indigo-400 transition-colors" />
                    </div>
                    <p className="font-semibold text-lg text-neutral-200 mb-2">Drag & drop or click to upload</p>
                    <p className="text-sm text-neutral-500 font-medium">Supports JPG, PNG, WEBP up to 10MB</p>
                  </div>
                ) : (
                  <div className="relative w-full rounded-3xl overflow-hidden bg-black/40 border border-white/10 flex justify-center items-center group shadow-2xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={imagePreviewUrl} 
                      alt="Preview" 
                      className="w-full h-auto object-contain max-h-[600px] transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                      onLoad={(e) => {
                        setImageSize({
                          width: e.currentTarget.naturalWidth,
                          height: e.currentTarget.naturalHeight
                        });
                      }}
                    />
                    
                    {/* BOUNDING BOXES */}
                    <AnimatePresence>
                      {detections.map((det, idx) => {
                        if (!imageSize.width || !imageSize.height) return null;
                        const left = (det.bbox[0] / imageSize.width) * 100;
                        const top = (det.bbox[1] / imageSize.height) * 100;
                        const width = ((det.bbox[2] - det.bbox[0]) / imageSize.width) * 100;
                        const height = ((det.bbox[3] - det.bbox[1]) / imageSize.height) * 100;

                        return (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.4, delay: idx * 0.1 }}
                            key={idx}
                            className="absolute border-[3px] border-indigo-400 bg-indigo-500/10 shadow-[0_0_30px_rgba(99,102,241,0.4)] pointer-events-none rounded-lg"
                            style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
                          >
                            <div className="absolute -top-10 left-[-3px] bg-indigo-500 text-white font-bold px-3 py-1.5 text-xs whitespace-nowrap rounded-lg shadow-xl flex items-center gap-1.5 border border-indigo-400 flex-shrink-0">
                              <Sparkles className="w-3 h-3 text-indigo-100" />
                              <span className="capitalize">{det.class_name}</span>
                              <span className="opacity-75 font-normal ml-1">{(det.confidence * 100).toFixed(0)}%</span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
                
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  className="hidden" 
                  accept="image/*"
                />

                <div className="mt-8">
                  <button
                    onClick={processImage}
                    disabled={!selectedFile || isUploading}
                    className="w-full relative group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-fuchsia-500 rounded-2xl blur-lg opacity-60 group-hover:opacity-100 transition duration-500"></div>
                    <div className="relative bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white font-bold text-lg px-8 py-4 rounded-2xl flex items-center justify-center gap-3 transition-transform duration-300 transform group-hover:-translate-y-1 group-active:translate-y-0">
                      {isUploading ? <Loader2 className="animate-spin w-6 h-6" /> : <Calculator className="w-6 h-6" />}
                      {isUploading ? "Running AI Engine..." : "Analyze Image"}
                    </div>
                  </button>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-start gap-3 backdrop-blur-sm"
                    >
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-400" />
                      <p className="text-sm font-medium leading-relaxed">{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

              </div>
            </motion.div>

            {/* MEAL HISTORY LOG */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
              className="relative p-[1px] rounded-[2rem] bg-gradient-to-b from-white/10 to-transparent shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="bg-[#0a0a0a] rounded-[2rem] p-8 h-full flex flex-col">
                <h2 className="text-2xl font-bold tracking-tight mb-6 flex items-center gap-2">
                  <Clock className="w-6 h-6 text-fuchsia-400" /> Recent History
                </h2>
                
                {logs.length === 0 ? (
                  <div className="text-center py-8 text-neutral-500">
                    <p>No food logged yet.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {logs.map((log) => (
                      <div key={log.id} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.04] transition-colors">
                        <div>
                          <p className="font-bold text-neutral-200 capitalize text-lg">{log.food_name}</p>
                          <p className="text-xs text-neutral-500 mt-0.5 font-medium">{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • {log.weight_grams} g</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-fuchsia-400 text-lg">{log.total_calories.toFixed(0)} <span className="text-xs font-medium opacity-80">kcal</span></p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>

          </div>

          {/* RIGHT COLUMN: DAILY SUMMARY & CURRENT MEAL NUTRITION */}
          <div className="xl:col-span-5 flex flex-col gap-8">
            
            {/* DAILY PROGRESS & SUGGESTIONS */}
            <motion.div 
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
              className="relative p-[1px] rounded-[2rem] bg-gradient-to-b from-white/10 to-transparent shadow-2xl overflow-hidden"
            >
              <div className="bg-[#0a0a0a] rounded-[2rem] p-8">
                <h2 className="text-2xl font-bold tracking-tight mb-6 flex items-center gap-2">
                  <Target className="w-6 h-6 text-emerald-400" /> Daily Target
                </h2>
                
                <div className="mb-6">
                  <div className="flex justify-between items-end mb-2">
                    <div>
                      <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200 tracking-tighter">
                        {dailySummary?.total_today?.toFixed(0) || 0}
                      </span>
                      <span className="text-sm text-emerald-500 ml-1 font-bold uppercase">kcal</span>
                    </div>
                    <span className="text-neutral-500 font-medium text-sm mb-1">{dailySummary?.goal || 2000} kcal goal</span>
                  </div>
                  
                  <div className="h-4 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(((dailySummary?.total_today || 0) / (dailySummary?.goal || 2000)) * 100, 100)}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 relative"
                    >
                      <div className="absolute inset-0 bg-white/20 w-full animate-pulse"></div>
                    </motion.div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-indigo-500/10 to-fuchsia-500/10 p-5 rounded-2xl border border-indigo-500/20 shadow-inner">
                  <p className="font-bold text-indigo-300 mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> AI Suggestion
                  </p>
                  <p className="text-neutral-300 text-sm leading-relaxed">
                    {dailySummary?.suggestion || "Loading recommendations..."}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* NUTRITION FACTS */}
            <motion.div 
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
              className="relative p-[1px] rounded-[2rem] bg-gradient-to-b from-white/10 to-transparent shadow-2xl flex-1 flex flex-col overflow-hidden"
            >
              <div className="bg-[#0a0a0a] rounded-[2rem] p-8 h-full flex flex-col">
                <div className="flex items-center justify-between mb-8 pb-6 border-b border-white/5">
                  <h2 className="text-2xl font-bold tracking-tight">Current Meal</h2>
                  <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-indigo-400 font-extrabold text-sm shadow-inner backdrop-blur-md">
                    {totalCalories.toFixed(0)} <span className="opacity-70 font-medium">kcal</span>
                  </div>
                </div>

                {foodItems.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-neutral-500">
                    <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6 border border-white/5 shadow-inner">
                      <Activity className="w-10 h-10 opacity-40" />
                    </div>
                    <p className="font-medium text-neutral-400 text-lg mb-2">Awaiting Analysis</p>
                    <p className="text-sm text-neutral-600 max-w-[250px]">Upload an image to reveal nutritional estimations.</p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col gap-5 overflow-y-auto pr-2 pb-4 smooth-scrollbar relative">
                    
                    <motion.div variants={containerVars} initial="hidden" animate="show" className="flex flex-col gap-4">
                      {foodItems.map((item) => (
                        <motion.div 
                          variants={itemVars}
                          exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                          key={item.id} 
                          className="bg-white/[0.03] border border-white/10 hover:border-indigo-500/30 rounded-2xl p-5 flex flex-col gap-4 group relative overflow-hidden transition-colors"
                        >
                          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none transition-opacity duration-500 group-hover:opacity-100 opacity-0"></div>
                          
                          <div className="flex items-start justify-between z-10 relative">
                            <div className="flex-1">
                              {item.id.startsWith('manual') ? (
                                <input 
                                  type="text" 
                                  value={item.className}
                                  onChange={(e) => handleManualNameChange(item.id, e.target.value)}
                                  className="bg-transparent text-xl font-bold border-b border-neutral-700/50 focus:border-indigo-400 outline-none w-[90%] text-indigo-300 placeholder-neutral-700 mb-1 transition-colors pb-1"
                                  placeholder="Food name..."
                                />
                              ) : (
                                <h3 className="text-xl font-bold text-white capitalize flex items-center gap-3 tracking-tight">
                                  {item.className} 
                                  {item.confidence && (
                                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded-md font-bold border border-indigo-500/30 uppercase tracking-wider backdrop-blur-md">
                                      {(item.confidence * 100).toFixed(0)}% Match
                                    </span>
                                  )}
                                </h3>
                              )}
                              <p className="text-sm text-neutral-500 font-medium mt-1.5 flex items-center gap-1.5">
                                <Info className="w-4 h-4" /> Base: {item.caloriesPer100g} kcal / 100g
                              </p>
                            </div>
                            <button 
                              onClick={() => handleRemoveItem(item.id)}
                              className="text-neutral-500 hover:text-red-400 p-2 opacity-50 hover:opacity-100 transition-all rounded-full hover:bg-red-400/10 active:scale-95"
                              title="Remove item"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          
                          <div className="flex items-center gap-4 bg-black/40 p-4 rounded-xl border border-white/5 z-10 relative shadow-inner">
                            <div className="flex-1 group/input">
                              <label className="text-[10px] text-neutral-500 mb-1.5 block uppercase tracking-widest font-bold">Weight</label>
                              <div className="flex items-center bg-white/5 border border-white/5 rounded-lg px-3 py-2 transition-colors focus-within:border-indigo-500/50 focus-within:bg-indigo-500/5">
                                <input 
                                  type="number" 
                                  value={item.weightGrams}
                                  onChange={(e) => handleWeightChange(item.id, e.target.value)}
                                  min="0"
                                  className="w-full bg-transparent border-none outline-none text-white font-semibold min-w-0 font-mono"
                                />
                                <span className="text-sm text-neutral-500 font-bold ml-2">g</span>
                              </div>
                            </div>
                            
                            <div className="w-px h-12 bg-white/5 mx-2"></div>
                            
                            <div className="flex-1 flex flex-col items-end">
                              <label className="text-[10px] text-neutral-500 mb-1.5 block uppercase tracking-widest font-bold">Energy</label>
                              <div className="flex items-center justify-end gap-2 h-full pb-1">
                                {item.isCalculating ? (
                                  <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                                ) : (
                                  <>
                                    <span className="text-2xl font-black text-white tracking-tight">{item.calculatedCalories.toFixed(0)}</span>
                                    <span className="text-sm text-neutral-500 font-bold mb-1">kcal</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                    
                    <button 
                      onClick={handleAddManualInput}
                      className="mt-4 w-full py-4 border-2 border-dashed border-white/10 hover:border-indigo-500/50 rounded-2xl flex items-center justify-center gap-2 text-neutral-400 hover:text-indigo-400 transition-colors font-medium bg-white/[0.01] hover:bg-indigo-500/10 focus:outline-none"
                    >
                      <PlusCircle className="w-5 h-5" /> 
                      <span>Add custom food entry</span>
                    </button>

                    <button 
                      onClick={handleSaveLog}
                      disabled={isLogging}
                      className="mt-4 w-full py-4 rounded-2xl flex items-center justify-center gap-2 text-white transition-all font-bold bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 shadow-lg shadow-emerald-500/20 active:scale-95 focus:outline-none disabled:opacity-50"
                    >
                      {isLogging ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} 
                      <span>{isLogging ? "Saving..." : "Log this Meal to History"}</span>
                    </button>
                    
                  </div>
                )}
              </div>
            </motion.div>            
          </div>

        </div>
      </main>
      
      {/* Global generic CSS for scrollbar since there wasn't a dedicated global css entry for this */}
      <style dangerouslySetInnerHTML={{__html: `
        .smooth-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .smooth-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
        }
        .smooth-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 8px;
        }
        .smooth-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(99, 102, 241, 0.5);
        }
      `}} />
    </div>
  );
}
