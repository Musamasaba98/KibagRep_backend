import fs from 'fs';

const file = 'c:/Users/User/OneDrive/Desktop/KibagRep/KibagRep-frontend/src/pages/RepPage/components/Sidebar.tsx';
let c = fs.readFileSync(file, 'utf8');

// 1. Add useNavigate
c = c.replace(
  "import { NavLink } from \"react-router-dom\";",
  "import { NavLink, useNavigate } from \"react-router-dom\";"
);

// 2. Add IoWarningOutline
c = c.replace(
  "import { MdOutlineEventRepeat, MdAdd, MdClose, MdCheckCircle } from \"react-icons/md\";",
  "import { MdOutlineEventRepeat, MdAdd, MdClose, MdCheckCircle } from \"react-icons/md\";\nimport { IoWarningOutline } from \"react-icons/io5\";"
);

// 3. Replace DoctorTile — find it by its unique outer shape and replace the whole block
const startMarker = "// ─── Doctor tile ───────────────────────────────────────────────────────────";
const endMarker = "// ─── Add-entry modal ──────────────────────────────────────────────────────────";

const startIdx = c.indexOf(startMarker);
const endIdx   = c.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error('Could not find DoctorTile boundaries');
  process.exit(1);
}

const newTile = `// ─── Doctor tile ─────────────────────────────────────────────────────────────

const DoctorTile = ({
  name,
  town,
  visited,
  label,
  onLogVisit,
  onNca,
  onViewProfile,
}: {
  name: string;
  town?: string;
  visited: boolean;
  label?: "planned" | "unplanned";
  onLogVisit?: () => void;
  onNca?: () => void;
  onViewProfile?: () => void;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
      <Initials name={name} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[#222f36] truncate">{name}</p>
        {town && <p className="text-[10px] text-gray-400 truncate">{town}</p>}
        {label && (
          <span className={
            \`inline-block text-[9px] font-bold uppercase tracking-wide mt-0.5 px-1.5 py-px rounded-full \${
              label === "unplanned" ? "bg-amber-50 text-amber-600" : "bg-[#f0fdf4] text-[#16a34a]"
            }\`
          }>
            {label}
          </span>
        )}
      </div>

      {visited ? (
        <MdCheckCircle className="w-4 h-4 text-[#16a34a] flex-shrink-0" />
      ) : (
        <div ref={menuRef} className="relative flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className="w-5 h-5 rounded-full bg-[#16a34a] text-white flex items-center justify-center hover:bg-[#15803d] focus-visible:outline-none shadow-sm"
            aria-label="Actions"
          >
            <MdAdd className="w-3.5 h-3.5" />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-7 z-50 bg-white rounded-xl border border-gray-100 overflow-hidden w-40 py-0.5"
              style={{ boxShadow: "0 4px 24px 0 rgba(0,0,0,0.10)" }}
            >
              {onLogVisit && (
                <button
                  onClick={() => { onLogVisit(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-[#16a34a] hover:bg-[#f0fdf4] focus-visible:outline-none"
                >
                  <MdCheckCircle className="w-3.5 h-3.5 shrink-0" />
                  Log Visit
                </button>
              )}
              {onNca && (
                <button
                  onClick={() => { onNca(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-amber-600 hover:bg-amber-50 focus-visible:outline-none border-t border-gray-50"
                >
                  <IoWarningOutline className="w-3.5 h-3.5 shrink-0" />
                  Flag NCA
                </button>
              )}
              {onViewProfile && (
                <button
                  onClick={() => { onViewProfile(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 focus-visible:outline-none border-t border-gray-50"
                >
                  <FaUserDoctor className="w-3.5 h-3.5 shrink-0" />
                  View Profile
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

`;

c = c.slice(0, startIdx) + newTile + c.slice(endIdx);
fs.writeFileSync(file, c);
console.log('done — menuOpen present:', c.includes('menuOpen'));
