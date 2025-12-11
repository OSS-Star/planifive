"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { ChevronLeft, ChevronRight, Save, Copy, Loader2, Calendar, Megaphone, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import ConfirmModal from "./ConfirmModal";

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const DAYS = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];
const MATCH_SIZE = 10;

type UserInfo = { id: string; name: string | null; image: string | null };
type SlotData = { users: UserInfo[]; count: number };

// Nouvelle prop pour communiquer avec la Navbar
export type GoldenSlot = { day: string; hour: number; date: Date; count?: number; type?: 'golden' | 'best' };

interface Call {
  id: string;
  date: string; // ISO string
  hour: number;
  location: string;
  duration: number;
  creatorId: string;
  creator: { name: string | null; image: string | null };
}

interface PlanningGridProps {
  onUpdateStats?: (slots: GoldenSlot[], potentialSlots: GoldenSlot[]) => void;
  onOpenCallModal?: (date?: string, hour?: string) => void;
}

export default function PlanningGrid({ onUpdateStats, onOpenCallModal }: PlanningGridProps) {
  const { data: session, status } = useSession();
  const [currentMonday, setCurrentMonday] = useState(getMonday(new Date()));
  const [mySlots, setMySlots] = useState<string[]>([]);
  const [slotDetails, setSlotDetails] = useState<Record<string, SlotData>>({});
  const [calls, setCalls] = useState<Call[]>([]); // Active calls
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [direction, setDirection] = useState(0);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ dayIndex: number; hour: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ dayIndex: number; hour: number } | null>(null);

  // États pour le modal de confirmation
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"save" | "apply" | "deleteCall" | null>(null);
  const [callToDelete, setCallToDelete] = useState<string | null>(null);

  // Ref to track if we are currently mutating data (to pause polling)
  const isMutating = useRef(false);
  // Ref to track the timestamp of the last mutation to discard stale fetches
  const lastMutationTime = useRef(0);

  // MANUAL SAVE MODE
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchDispos();
    fetchCalls();

    // Polling every 10 seconds to keep data fresh without overwriting user actions immediately
    const interval = setInterval(() => {
      fetchDispos();
      fetchCalls();
    }, 10000);

    return () => clearInterval(interval);
  }, [currentMonday]);

  // Calculer les stats (Matchs Gold et Potentiels) à chaque changement de données
  useEffect(() => {
    if (!onUpdateStats) return;

    const goldenSlots: GoldenSlot[] = [];
    const potentialCandidates: GoldenSlot[] = [];
    let maxCount = 0;

    // 1. Extraire toutes les dates uniques des données disponibles (slotDetails)
    const uniqueDates = new Set<string>();

    // Ajouter les dates de slotDetails
    Object.keys(slotDetails).forEach(key => {
      const parts = key.split('-');
      // key format: YYYY-MM-DD-H
      if (parts.length >= 4) {
        const dateStr = `${parts[0]}-${parts[1]}-${parts[2]}`;
        uniqueDates.add(dateStr);
      }
    });

    // Ajouter les dates de la semaine affichée pour s'assurer qu'on voit au moins la semaine courante
    for (let i = 0; i < 7; i++) {
      const date = addDays(currentMonday, i);
      uniqueDates.add(formatDateLocal(date));
    }

    // Convertir en tableau et trier
    const sortedDates = Array.from(uniqueDates).sort();

    // 2. Parcourir toutes les dates
    sortedDates.forEach(dateStr => {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      // getDay(): 0=Sun, 1=Mon... We want 0=Mon...6=Sun
      const dayIndex = dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1;
      const dayName = DAYS[dayIndex];

      // On cherche les débuts de séquences de 4h (ex: 20h, 21h, 22h, 23h pleines)
      for (let h = 8; h <= 20; h++) { // Max 20 car 20+3 = 23
        const slot1 = slotDetails[`${dateStr}-${h}`];
        const slot2 = slotDetails[`${dateStr}-${h + 1}`];
        const slot3 = slotDetails[`${dateStr}-${h + 2}`];
        const slot4 = slotDetails[`${dateStr}-${h + 3}`];

        const c1 = slot1?.count || 0;
        const c2 = slot2?.count || 0;
        const c3 = slot3?.count || 0;
        const c4 = slot4?.count || 0;

        // Golden Slot (40/40)
        if (c1 >= MATCH_SIZE && c2 >= MATCH_SIZE && c3 >= MATCH_SIZE && c4 >= MATCH_SIZE) {
          goldenSlots.push({ day: dayName, hour: h, date: dateObj, type: 'golden' });
        }
        // Potential Slot (Not full but has players in ALL 4 slots)
        else {
          // Calculate intersection of users present in all 4 slots
          const users1 = slot1?.users || [];
          const users2 = slot2?.users || [];
          const users3 = slot3?.users || [];
          const users4 = slot4?.users || [];

          // Find users present in all 4 lists
          const commonUsersCount = users1.filter(u1 =>
            users2.some(u2 => u2.id === u1.id) &&
            users3.some(u3 => u3.id === u1.id) &&
            users4.some(u4 => u4.id === u1.id)
          ).length;

          if (commonUsersCount > 0) {
            potentialCandidates.push({ day: dayName, hour: h, date: dateObj, count: commonUsersCount, type: 'best' });
          }
          if (commonUsersCount > maxCount) {
            maxCount = commonUsersCount;
          }
        }
      }
    });

    // Filtrer pour ne garder que ceux qui ont le maxCount (si maxCount > 0)
    const bestPotentialSlots = maxCount > 0
      ? potentialCandidates.filter(p => p.count === maxCount)
      : [];

    onUpdateStats(goldenSlots, bestPotentialSlots);
  }, [slotDetails, currentMonday, onUpdateStats]);

  useEffect(() => {
    const handleGlobalMouseUp = async () => {
      // If dragStart equals dragEnd, it's a click, so let onClick handle it.
      // We only apply drag selection if we actually dragged across multiple slots (or at least moved).
      // However, checking strictly equality might be tricky if we want drag-to-select single slot to work?
      // Actually, standard behavior: Click = Toggle. Drag = Set range.
      // If I click, dragStart == dragEnd.
      // If I want to fix the double toggle, I should skip applyDragSelection if start == end.
      if (isDragging && dragStart && dragEnd) {
        if (dragStart.dayIndex !== dragEnd.dayIndex || dragStart.hour !== dragEnd.hour) {
          applyDragSelection();
        }
      }
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [isDragging, dragStart, dragEnd]);

  const fetchDispos = async () => {
    if (isMutating.current) return; // Skip polling if user is interacting

    const fetchStartTime = Date.now();

    try {
      // Fetch range: Current week - 1 week to Current week + 2 weeks (buffer)
      const start = new Date(currentMonday);
      start.setDate(start.getDate() - 7);
      const end = new Date(currentMonday);
      end.setDate(end.getDate() + 21);

      const query = `?start=${start.toISOString()}&end=${end.toISOString()}`;
      const res = await fetch(`/api/availability${query}`, { cache: "no-store" });

      if (res.ok) {
        const data = await res.json();

        // STALE CHECK: If a mutation happened AFTER this fetch started, discard the result.
        if (!isMutating.current && lastMutationTime.current < fetchStartTime) {

          let nextSlotDetails = data.slotDetails || {};

          // OPTIMIZATION: Merge server data with local optimistic state if unsaved
          if (unsavedChanges && session?.user?.id) {
            // 1. Deep copy to avoid mutating data.slotDetails directly
            // (Simpler: just iterate and create new objects where needed)
            const mergedDetails = { ...nextSlotDetails };

            // 2. Remove "Me" from ALL server slots (to clear old server state about me)
            Object.keys(mergedDetails).forEach(key => {
              const details = { ...mergedDetails[key] }; // Copy level 2
              const userIndex = details.users.findIndex((u: any) => u.id === session.user?.id);
              if (userIndex !== -1) {
                details.users = details.users.filter((u: any) => u.id !== session.user?.id);
                details.count = Math.max(0, details.count - 1);
                mergedDetails[key] = details;
              }
            });

            // 3. Add "Me" to slots based on local mySlots
            mySlots.forEach(key => {
              // Ensure slot object exists
              const details = mergedDetails[key] ? { ...mergedDetails[key] } : { users: [], count: 0 };

              // Add me if not present (should not be present due to step 2)
              details.users = [
                ...details.users,
                {
                  id: session.user?.id,
                  name: session.user?.name || "Moi",
                  image: session.user?.image || null
                }
              ];
              details.count++;

              mergedDetails[key] = details;
            });

            nextSlotDetails = mergedDetails;
          } else {
            // Only update mySlots if NO unsaved changes
            setMySlots(data.mySlots || []);
          }

          setSlotDetails(nextSlotDetails);
        }
      }
    } catch (error) { console.error(error); }
  };

  const fetchCalls = async () => {
    try {
      const res = await fetch("/api/calls");
      if (res.ok) {
        const data = await res.json();
        setCalls(data);
      }
    } catch (error) { console.error(error); }
  };

  const saveChanges = async () => {
    setIsSaving(true);
    try {
      // 1. Calculate range for current view (Monday to Sunday)
      const start = new Date(currentMonday);
      const end = addDays(currentMonday, 6);

      // 2. Filter mySlots to get only those in this range
      const slotsToSave = [];
      for (let i = 0; i < 7; i++) {
        const date = addDays(currentMonday, i);
        const dateStr = formatDateLocal(date);
        for (const hour of HOURS) {
          const key = `${dateStr}-${hour}`;
          if (mySlots.includes(key)) {
            slotsToSave.push({ date: dateStr, hour });
          }
        }
      }

      // 3. Send PUT request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const res = await fetch("/api/availability", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: formatDateLocal(start),
          end: formatDateLocal(end),
          slots: slotsToSave
        }),
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.details || errData.error || "Save failed");
      }

      setUnsavedChanges(false);
      // Force refresh to confirm sync
      lastMutationTime.current = Date.now(); // Reset stale check
      await fetchDispos();

    } catch (error: any) {
      console.error("Save error:", error);
      alert(`Erreur lors de la sauvegarde: ${error.message || "Erreur inconnue"}`);
    } finally {
      setIsSaving(false);
    }
  };

  const applyDragSelection = async () => {
    if (!dragStart || !dragEnd || !session?.user?.id) return;

    // Update mutation timestamp
    lastMutationTime.current = Date.now();

    const minDay = Math.min(dragStart.dayIndex, dragEnd.dayIndex);
    const maxDay = Math.max(dragStart.dayIndex, dragEnd.dayIndex);
    const minHour = Math.min(dragStart.hour, dragEnd.hour);
    const maxHour = Math.max(dragStart.hour, dragEnd.hour);

    const startDateStr = formatDateLocal(addDays(currentMonday, dragStart.dayIndex));
    const startKey = `${startDateStr}-${dragStart.hour}`;
    const isRemoving = mySlots.includes(startKey);

    const slotsToUpdate: { date: string; hour: number }[] = [];
    const newSlots = [...mySlots];

    for (let d = minDay; d <= maxDay; d++) {
      for (let h = minHour; h <= maxHour; h++) {
        const date = addDays(currentMonday, d);
        const dateStr = formatDateLocal(date);
        const key = `${dateStr}-${h}`;
        const isSelected = newSlots.includes(key);

        if (isRemoving && isSelected) {
          const idx = newSlots.indexOf(key);
          if (idx > -1) newSlots.splice(idx, 1);
          slotsToUpdate.push({ date: dateStr, hour: h });
        } else if (!isRemoving && !isSelected) {
          newSlots.push(key);
          slotsToUpdate.push({ date: dateStr, hour: h });
        }
      }
    }

    // Optimistic Update
    setMySlots(newSlots);

    setUnsavedChanges(true);
    // Batch API Call (Disabled for Manual Save)
    if (false && slotsToUpdate.length > 0) {
      try {
        isMutating.current = true;
        lastMutationTime.current = Date.now();
        const res = await fetch("/api/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slots: slotsToUpdate }),
        });

        if (!res.ok) {
          throw new Error("Batch update failed");
        }
      } catch (error) {
        console.error("Batch update error:", error);
        alert("Erreur lors de la sauvegarde groupée.");
        fetchDispos(); // Revert on error
      } finally {
        setTimeout(() => { isMutating.current = false; }, 500);
      }
    }
  };

  const toggleSlot = async (dateStr: string, hour: number) => {
    if (status !== "authenticated") {
      alert("Connecte-toi pour voter !");
      return;
    }

    lastMutationTime.current = Date.now();

    const key = `${dateStr}-${hour}`;
    const isSelected = mySlots.includes(key);

    // Check if this slot is part of an active call created by the current user
    const callOnSlot = calls.find(c =>
      new Date(c.date).toDateString() === new Date(dateStr).toDateString() &&
      c.hour <= hour &&
      hour < c.hour + (c.duration === 90 ? 5 : 4)
    );

    const isCreator = callOnSlot?.creatorId === session?.user?.id;

    // If creator tries to deselect a slot of their call -> Delete the call
    if (isCreator && isSelected) {
      setCallToDelete(callOnSlot.id);
      setPendingAction("deleteCall");
      setModalOpen(true);
      return;
    }

    // --- OPTIMISTIC UPDATE ONLY ---
    setMySlots(prev => isSelected ? prev.filter(s => s !== key) : [...prev, key]);
    setUnsavedChanges(true);

    // Update slotDetails immediately for responsiveness
    setSlotDetails(prev => {
      const currentDetails = prev[key] || { users: [], count: 0 };
      let newUsers = [...currentDetails.users];
      let newCount = currentDetails.count;

      if (isSelected) {
        newUsers = newUsers.filter(u => u.id !== session.user?.id);
        newCount = Math.max(0, newCount - 1);
      } else {
        if (session.user && !newUsers.some(u => u.id === session.user?.id)) {
          newUsers.push({
            id: session.user.id,
            name: session.user.name || "Moi",
            image: session.user.image || null
          });
          newCount++;
        }
      }
      return { ...prev, [key]: { users: newUsers, count: newCount } };
    });
  };

  const handleAction = async (action: "save" | "apply") => {
    console.log("🔵 handleAction appelé avec action:", action);
    setPendingAction(action);
    setModalOpen(true);
    console.log("🔵 Modal state set to true, modalOpen should be:", true);
  };

  const executeAction = async () => {
    if (!pendingAction) return;
    console.log("🟢 executeAction appelé avec pendingAction:", pendingAction);

    if (pendingAction === "deleteCall" && callToDelete) {
      try {
        await fetch(`/api/calls?id=${callToDelete}`, { method: "DELETE" });
        setCalls(calls.filter(c => c.id !== callToDelete));
        // Also refresh slots to remove the blue border immediately
        fetchDispos();
      } catch (e) {
        console.error("Failed to delete call", e);
      }
      setLoadingAction(null);
      setPendingAction(null);
      setCallToDelete(null);
      setModalOpen(false);
      return;
    }

    setLoadingAction(pendingAction);
    const body: any = { action: pendingAction };
    if (pendingAction === "save") {
      const slotsToSave = [];
      for (let i = 0; i < 7; i++) {
        const date = addDays(currentMonday, i);
        const dateStr = formatDateLocal(date);
        const dayOfWeek = date.getDay();
        for (const hour of HOURS) {
          if (mySlots.includes(`${dateStr}-${hour}`)) slotsToSave.push({ dayOfWeek, hour });
        }
      }
      body.slots = slotsToSave;
    } else {
      body.mondayDate = formatDateLocal(currentMonday);
    }
    await fetch("/api/template", { method: "POST", body: JSON.stringify(body) });
    if (pendingAction === "apply") await fetchDispos();
    setLoadingAction(null);
    setPendingAction(null);
    setModalOpen(false); // Close modal
  };

  const handleDeleteCall = async (callId: string) => {
    try {
      const res = await fetch(`/api/calls?id=${callId}`, { method: "DELETE" });
      if (res.ok) {
        fetchCalls();
      } else {
        alert("Erreur lors de la suppression");
      }
    } catch (error) {
      console.error(error);
    }
  };

  const changeWeek = (dir: number) => {
    setDirection(dir);
    setCurrentMonday(prev => addDays(prev, dir * 7));
  };

  const onMouseDown = (d: number, h: number) => { setIsDragging(true); setDragStart({ dayIndex: d, hour: h }); setDragEnd({ dayIndex: d, hour: h }); };
  const onMouseEnter = (d: number, h: number) => { if (isDragging) setDragEnd({ dayIndex: d, hour: h }); };
  const isInDragZone = (dIndex: number, h: number) => {
    if (!isDragging || !dragStart || !dragEnd) return false;
    const minD = Math.min(dragStart.dayIndex, dragEnd.dayIndex);
    const maxD = Math.max(dragStart.dayIndex, dragEnd.dayIndex);
    const minH = Math.min(dragStart.hour, dragEnd.hour);
    const maxH = Math.max(dragStart.hour, dragEnd.hour);
    return dIndex >= minD && dIndex <= maxD && h >= minH && h <= maxH;
  };

  // --- HELPER GOLDEN SLOT ---
  const checkFull = (dStr: string, h: number) => {
    const key = `${dStr}-${h}`;
    return (slotDetails[key]?.count || 0) >= MATCH_SIZE;
  };
  const isGoldenSlot = (dStr: string, h: number) => {
    if (!checkFull(dStr, h)) return false;
    // Check for 4 consecutive slots (current slot is h)
    // Possible positions for h in a sequence of 4: 1st, 2nd, 3rd, 4th
    const p3 = checkFull(dStr, h - 3);
    const p2 = checkFull(dStr, h - 2);
    const p1 = checkFull(dStr, h - 1);
    const n1 = checkFull(dStr, h + 1);
    const n2 = checkFull(dStr, h + 2);
    const n3 = checkFull(dStr, h + 3);

    return (
      (p3 && p2 && p1) || // h is 4th
      (p2 && p1 && n1) || // h is 3rd
      (p1 && n1 && n2) || // h is 2nd
      (n1 && n2 && n3)    // h is 1st
    );
  };

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 50 : -50, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -50 : 50, opacity: 0 }),
  };

  console.log("🟣 Rendering PlanningGrid - modalOpen:", modalOpen, "pendingAction:", pendingAction);

  return (
    <>
      <div className="w-full h-full bg-[#121212] rounded-[32px] border border-[#222] flex flex-col overflow-hidden shadow-2xl relative select-none">

        {/* HEADER GRILLE */}
        <div className="flex items-center justify-between px-6 bg-[#181818] border-b border-[#282828] shrink-0 h-16 relative">
          <div className="flex items-center gap-4">
            <button onClick={() => changeWeek(-1)} className="p-2 hover:bg-gray-700/50 rounded-full text-gray-400 hover:text-white transition-all duration-300 hover:scale-110 active:scale-95"><ChevronLeft size={18} /></button>
            <div className="flex items-center gap-2 px-2">
              <Calendar size={14} className="text-[#1ED760]" />
              <span className="text-sm font-bold text-white uppercase tracking-wider min-w-[140px] text-center">
                {currentMonday.toLocaleDateString("fr-FR", { month: "long", day: "numeric" })}
              </span>
            </div>
            <button onClick={() => changeWeek(1)} className="p-2 hover:bg-gray-700/50 rounded-full text-gray-400 hover:text-white transition-all duration-300 hover:scale-110 active:scale-95"><ChevronRight size={18} /></button>
          </div>

          {/* CENTERED SAVE BUTTON */}
          {unsavedChanges && (
            <div className="absolute left-1/2 top-0 -translate-x-1/2 z-10 h-full">
              <ActionButton
                onClick={saveChanges}
                loading={isSaving}
                label={`SAUVEGARDER`}
                icon={<Save size={14} />}
                green
                className="rounded-none shadow-[0_0_15px_rgba(34,197,94,0.3)] px-8"
              />
            </div>
          )}

          <div className="flex h-full">
            <ActionButton
              onClick={() => handleAction("save")}
              loading={loadingAction === "save"}
              label="Sauver Modèle"
              icon={<Save size={14} />}
              green
              className="rounded-l-full rounded-r-none pr-3"
            />
            <ActionButton
              onClick={() => handleAction("apply")}
              loading={loadingAction === "apply"}
              label="Appliquer"
              icon={<Copy size={14} />}
              className="rounded-r-full rounded-l-none pl-3 border-l border-[#333]"
            />
          </div>
        </div>

        {/* ZONE GRILLE */}
        <div className="flex-1 relative w-full h-full overflow-hidden bg-[#0F0F0F]">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentMonday.toISOString()}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="absolute inset-0 w-full h-full"
            >
              <div className="w-full h-full grid grid-cols-[60px_repeat(7,1fr)] grid-rows-[50px_repeat(16,minmax(0,0.9fr))] divide-x divide-y divide-[#222]">
                <div className="bg-[#141414]"></div>

                {/* En-têtes Jours */}
                {DAYS.map((day, i) => {
                  const date = addDays(currentMonday, i);
                  const isToday = new Date().toDateString() === date.toDateString();
                  return (
                    <div key={day} className={`flex flex-col items-center justify-center ${isToday ? 'bg-[#1C1C1C]' : 'bg-[#141414]'}`}>
                      <span className={`text-[10px] font-bold tracking-widest mb-1 ${isToday ? 'text-[#1ED760]' : 'text-gray-500'}`}>{day}</span>
                      <span className={`text-lg font-bold ${isToday ? 'text-white' : 'text-gray-400'}`}>{date.getDate()}</span>
                    </div>
                  );
                })}

                {/* Corps */}
                {HOURS.map((hour) => (
                  <Fragment key={hour}>
                    <div className="bg-[#141414] flex items-center justify-center text-[11px] font-mono text-gray-600 font-medium select-none pointer-events-none">{hour}h</div>

                    {DAYS.map((_, i) => {
                      const date = addDays(currentMonday, i);
                      const dateStr = formatDateLocal(date);
                      const key = `${dateStr}-${hour}`;

                      const isSelectedReal = mySlots.includes(key);
                      const isDragZone = isInDragZone(i, hour);
                      const isSelected = isDragZone ? !isSelectedReal : isSelectedReal;

                      const details = slotDetails[key] || { users: [], count: 0 };
                      const count = details.count;
                      const isFull = count >= MATCH_SIZE;
                      const isGold = isGoldenSlot(dateStr, hour);

                      // Check for active call
                      const activeCall = calls.find(
                        (c) =>
                          new Date(c.date).toDateString() === new Date(dateStr).toDateString() &&
                          hour >= c.hour &&
                          hour < c.hour + (c.duration === 90 ? 5 : 4)
                      );

                      // Dynamic Styles
                      let bgClass = "bg-[#1A1A1A]"; // Default dark
                      let extraClasses = "";

                      // We use inline styles for the background to ensure it overrides everything
                      const cellStyle: React.CSSProperties = {};

                      // PRIORITY: Active Call > Selection > Golden > Full
                      if (activeCall) {
                        bgClass = "call-active-slot";
                        // Use CSS variable logic for background
                        if (isSelected) {
                          extraClasses += " selected";
                        }
                        // Note: We do NOT set cellStyle.zIndex here because the CSS class handles it (z-index: 10 or 20).

                      } else if (isSelected) {
                        // FORCE GREEN via inline style only if NOT active call
                        cellStyle.backgroundColor = '#22c55e'; // green-500
                        cellStyle.zIndex = 10; // Ensure it's on top
                        cellStyle.boxShadow = 'inset 0 0 20px rgba(0,0,0,0.2), 0 0 10px rgba(34, 197, 94, 0.4)';
                      } else if (isGold) {
                        bgClass = "bg-yellow-500/20 border-yellow-500/50";
                      } else if (isFull) {
                        bgClass = "bg-red-500/20";
                      }

                      if (!activeCall && !isSelected && !isGold && !isFull) {
                        extraClasses += " hover:bg-[#252525]";
                      } return (
                        <div
                          key={key}
                          onMouseDown={() => onMouseDown(i, hour)}
                          onMouseEnter={() => onMouseEnter(i, hour)}
                          onClick={() => toggleSlot(dateStr, hour)}
                          style={cellStyle}
                          className={`relative group transition-all duration-200 border-b border-r border-[#222] cursor-pointer flex flex-col items-center justify-center ${extraClasses} group-hover:z-50`}
                        >
                          {/* VISUAL LAYER (Background / Active Call Effect) - Decoupled to avoid clipping tooltip */}
                          <div className={`absolute inset-0 z-0 ${bgClass} pointer-events-none`}></div>

                          {count > 0 && (
                            <div className="w-full h-full flex items-center justify-center pointer-events-none relative z-20">
                              <span className={`text-sm font-bold ${isSelected || isGold ? 'text-black' : (isFull ? 'text-red-500' : (activeCall ? 'text-[#5865F2]' : 'text-white'))}`}>
                                {count}
                              </span>
                            </div>
                          )}

                          {/* TOOLTIP - Conditional Positioning */}
                          {!isDragging && (
                            <div
                              className={`absolute z-[1000] bottom-full pb-2 hidden group-hover:block pointer-events-auto ${i === 0 ? "left-full ml-2" : "right-full mr-2"
                                }`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="bg-[#1A1A1A] border border-[#333] p-4 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] min-w-[220px] flex flex-col gap-3 backdrop-blur-sm relative">
                                <div className="flex justify-between items-center border-b border-[#333] pb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">JOUEURS</span>
                                    {/* User requested to remove the call button when people present */}
                                  </div>
                                  {isGold ? (
                                    <span className="text-[9px] font-black text-yellow-500 uppercase tracking-widest animate-pulse">Matchs 4H</span>
                                  ) : activeCall ? (
                                    <span className="text-[9px] font-black text-[#5865F2] uppercase tracking-widest flex items-center gap-1">
                                      <Megaphone size={10} /> APPEL EN COURS
                                    </span>
                                  ) : (
                                    <span className={`text-[10px] font-black ${isFull ? 'text-red-500' : 'text-[#1ED760]'}`}>
                                      {count}/{MATCH_SIZE}
                                    </span>
                                  )}
                                </div>

                                {activeCall && (
                                  <div className="bg-[#5865F2]/10 p-2 rounded border border-[#5865F2]/30 text-xs text-gray-300 mb-2 relative group/call">
                                    <div className="font-bold text-[#5865F2] mb-1">📍 {activeCall.location}</div>
                                    <div>Appel lancé par {activeCall.creator.name}</div>


                                  </div>
                                )}

                                <div className="flex flex-col gap-2">
                                  {details.users.map((u, idx) => (
                                    <div key={idx} className="flex items-center gap-8">
                                      <img
                                        src={u.image || ""}
                                        className="w-0.5 h-0.5 rounded-full bg-black object-cover flex-shrink-0"
                                        alt="u"
                                        style={{ width: '50px', height: '50px' }}
                                      />
                                      <span className="text-[14px] text-gray-300 font-bold truncate ml-16">{u.name}</span>
                                    </div>
                                  ))}

                                  {details.users.length === 0 && !activeCall && (
                                    <div className="text-xs text-gray-600 italic text-center py-2">Aucun joueur</div>
                                  )}
                                </div>
                              </div>
                              {/* Arrow pointing to the slot */}
                              <div className={`w-3 h-3 bg-[#1A1A1A] border-t border-[#333] rotate-45 absolute bottom-4 ${i === 0 ? "left-[-7px] border-l" : "right-[-7px] border-r"
                                }`}></div>
                            </div>
                          )}

                          {/* Call Action in Tooltip (or Context Menu) */}
                          {/* We use the same tooltip for simplicity, but we add a button if no call exists */}
                          {!activeCall && !isGold && count < MATCH_SIZE && (
                            <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col gap-2 pointer-events-auto">
                              {/* Existing tooltip content is above, we might need to merge them or just add the button to the existing tooltip */}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Modal de confirmation */}
      <ConfirmModal
        isOpen={modalOpen}
        onClose={() => {
          console.log("🔴 Modal fermé");
          setModalOpen(false);
          setPendingAction(null);
          setCallToDelete(null);
        }}
        onConfirm={executeAction}
        title={
          pendingAction === "deleteCall" ? "Supprimer l'appel ?" :
            pendingAction === "save" ? "Sauvegarder le Modèle" : "Appliquer le Modèle"
        }
        message={
          pendingAction === "deleteCall"
            ? "Êtes-vous sûr de vouloir supprimer votre appel ? Cela désinscrira tous les participants."
            : pendingAction === "save"
              ? "Voulez-vous sauvegarder cette semaine comme modèle de référence ?"
              : "Voulez-vous appliquer le modèle sauvegardé à cette semaine ?"
        }
        type={pendingAction === "deleteCall" ? "danger" : (pendingAction === "apply" ? "apply" : "save")}
      />
    </>
  );
}

function ActionButton({ onClick, loading, label, icon, green = false, className = "" }: any) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`
        flex items-center gap-2 px-4 font-bold text-xs uppercase tracking-wider transition-all duration-300 hover:scale-105 h-full border-none outline-none ring-0 rounded-full
        ${green
          ? 'bg-gradient-to-r from-[#22C55E] to-[#16a34a] text-black shadow-[0_0_15px_rgba(34,197,94,0.3)] hover:from-[#16a34a] hover:to-[#15803d] hover:shadow-[0_0_20px_rgba(34,197,94,0.4)]'
          : 'bg-gradient-to-br from-[#181818] to-[#2a2a2a] text-gray-300 hover:from-[#2a2a2a] hover:to-[#404040] hover:text-white hover:shadow-lg'}
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none
        ${className}
      `}
    >
      {loading ? <Loader2 className="animate-spin" size={14} /> : icon}
      <span>{label}</span>
    </button>
  );
}

function getMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDateLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}