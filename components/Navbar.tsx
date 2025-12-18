import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useState } from "react"; // Added useState import
import { Megaphone, Trophy, History, Shield, LogOut } from "lucide-react"; // Assuming these are from lucide-react

interface GoldenSlot {
  day: string;
  hour: number;
  endHour?: number;
  date: Date;
  count?: number;
}

interface NavbarProps {
  goldenSlots?: GoldenSlot[];
  potentialSlots?: GoldenSlot[];
  title?: string;
  icon?: React.ReactNode;
  onOpenCallModal?: () => void;
}

export default function Navbar({ goldenSlots, potentialSlots, title, icon, onOpenCallModal }: NavbarProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const hideCallButton = ["/admin", "/history", "/leaderboard"].includes(pathname);
  const [showTooltip, setShowTooltip] = useState(false);

  const ADMIN_EMAILS = ["sheizeracc@gmail.com"];
  const isAdmin = session?.user?.email && ADMIN_EMAILS.includes(session.user.email);

  if (!session) return null;

  const displayName = session?.user?.name || session?.user?.email?.split('@')[0] || "Utilisateur";
  const displayImage = session?.user?.image;

  return (
    <>
      <div style={{ height: '60px', background: '#121212', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid #333', marginBottom: '12px', position: 'relative', zIndex: 50 }}>

        {/* Left: Logo */}
        <Link href="/" className="nav-logo-hover" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', color: 'inherit', zIndex: 10 }}>
          <div style={{ width: '40px', height: '40px' }}>
            <img
              src="/logo-five.png"
              alt="Planifive Logo"
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
            />
          </div>
          <span style={{ fontWeight: 'bold', fontSize: '18px', color: 'white' }}>Planifive</span>
        </Link>

        {/* Center: Title OR Stats */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {title ? (
            // Sub-page Title Mode
            <>
              {icon}
              <span style={{ fontFamily: 'var(--font-oswald)', fontSize: '20px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'white' }}>
                {title}
              </span>
            </>
          ) : goldenSlots ? (
            // Home Page Stats Mode
            <div
              style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', background: '#1A1A1A', padding: '6px 14px', borderRadius: '8px', border: '1px solid #333', cursor: 'pointer' }}
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
            >
              <span style={{ fontSize: '11px', color: '#999', textTransform: 'uppercase' }}>Créneaux 4h</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Trophy size={13} color="#EAB308" />
                <span style={{ fontWeight: 'bold', fontSize: '13px', color: 'white' }}>{goldenSlots.length}</span>
              </div>

              {/* Tooltip */}
              {showTooltip && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginTop: '8px',
                  background: '#1F1F1F',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  padding: '12px',
                  minWidth: '260px',
                  zIndex: 1000,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                }}>
                  {/* Golden Slots Section */}
                  {goldenSlots.length > 0 && (
                    <>
                      <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px', fontWeight: '600' }}>Créneaux validés (4h)</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {goldenSlots.map((slot, idx) => (
                          <div key={idx} style={{
                            fontSize: '11px',
                            color: '#1ED760',
                            fontWeight: '600',
                            background: '#0A0A0A',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            border: '1px solid #2A2A2A'
                          }}>
                            {slot.day} • {slot.hour}h-{slot.endHour || (slot.hour + 4)}h
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Divider if both exist */}
                  {goldenSlots.length > 0 && potentialSlots && potentialSlots.length > 0 && (
                    <div style={{ height: '1px', background: '#333', margin: '12px 0' }} />
                  )}

                  {/* Best Potential Slot Section */}
                  {potentialSlots && potentialSlots.length > 0 && (
                    <>
                      <div style={{ fontSize: '11px', color: '#999', marginBottom: '8px', fontWeight: '600' }}>Potentiels 4h (En cours)</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {potentialSlots.map((slot, idx) => {
                          const dateStr = slot.date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
                          const dayName = slot.date.toLocaleDateString('fr-FR', { weekday: 'short' });

                          // Color Logic
                          let countColor = '#F97316'; // Default Orange (< 10)
                          let countBg = '#F97316';

                          if (slot.count && slot.count >= 10) {
                            if (slot.count % 2 === 0) {
                              // Even >= 10 -> Green
                              countColor = '#22C55E';
                              countBg = '#22C55E';
                            } else {
                              // Odd >= 11 -> Yellow
                              countColor = '#EAB308';
                              countBg = '#EAB308';
                            }
                          }

                          return (
                            <div key={idx} style={{
                              fontSize: '11px',
                              color: countColor,
                              fontWeight: '600',
                              background: '#0A0A0A',
                              padding: '6px 8px',
                              borderRadius: '4px',
                              border: '1px solid #2A2A2A',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}>
                              <span>{dateStr} ({dayName}) • {slot.hour}h-{slot.endHour || (slot.hour + 4)}h</span>
                              <span style={{ background: countBg, color: 'black', padding: '1px 4px', borderRadius: '2px', fontSize: '10px', fontWeight: 'bold' }}>
                                {slot.count}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* Empty State */}
                  {goldenSlots.length === 0 && (!potentialSlots || potentialSlots.length === 0) && (
                    <div style={{ fontSize: '10px', color: '#666', fontWeight: '500' }}>
                      Aucun créneau pour le moment
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Right: User & Menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', zIndex: 10 }}>

          {/* Call Button */}
          {!hideCallButton && (
            <button
              onClick={() => onOpenCallModal?.()}
              className="p-2 bg-[#5865F2]/10 hover:bg-[#5865F2]/20 text-[#5865F2] rounded-full transition-colors cursor-pointer"
              title="Lancer un appel"
            >
              <Megaphone size={20} />
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', background: '#333', border: '2px solid #555' }}>
              {displayImage ? (
                <img
                  src={displayImage}
                  alt="Profile"
                  referrerPolicy="no-referrer"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    console.error("Failed to load image:", displayImage);
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '14px' }}>
                  {displayName.charAt(0)?.toUpperCase() || "?"}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'white', lineHeight: '1' }}>
                {displayName}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22C55E' }} />
                <span style={{ fontSize: '10px', color: '#22C55E', fontWeight: '500' }}>Connecté</span>
              </div>
            </div>
          </div>

          {/* Custom CSS Menu */}
          <div id="custom-menu">
            <input type="checkbox" id="menu-toggle" />
            <ul className={isAdmin ? "admin-mode" : ""}>
              <li>
                <Link href="/history" title="Historique">
                  <History size={20} className="text-green-500" color="#22C55E" />
                </Link>
              </li>
              <li>
                <Link href="/leaderboard" title="Classement">
                  <Trophy size={20} className="text-yellow-400" color="#EAB308" />
                </Link>
              </li>
              {isAdmin && (
                <li>
                  <Link href="/admin" title="Administration">
                    <Shield size={20} className="text-violet-500" color="#8B5CF6" />
                  </Link>
                </li>
              )}
              <li>
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  title="Se déconnecter"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}
                >
                  <LogOut size={20} className="text-red-500" color="#EF4444" />
                </button>
              </li>
            </ul>
          </div>
        </div >

      </div >
    </>
  );
}
