import { useState } from "react";

const DAY_ABBREVS = ["D", "S", "T", "Q", "Q", "S", "S"];

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface CalendarProps {
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

function toYMD(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayYMD(): string {
  const d = new Date();
  return toYMD(d.getFullYear(), d.getMonth(), d.getDate());
}

export default function Calendar({ selectedDate, onSelectDate }: CalendarProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const todayStr = todayYMD();

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  // First day of the month (0=Sun)
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  // Build grid: leading blanks + days
  const cells: (number | null)[] = [
    ...Array(firstDayOfMonth).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Pad to complete last week row
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="bg-white rounded-2xl shadow p-4 w-full max-w-sm mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
          aria-label="Mês anterior"
        >
          ‹
        </button>
        <span className="font-semibold text-gray-800">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
          aria-label="Próximo mês"
        >
          ›
        </button>
      </div>

      {/* Day abbreviations */}
      <div className="grid grid-cols-7 mb-2">
        {DAY_ABBREVS.map((abbrev, i) => (
          <div
            key={i}
            className="text-center text-xs font-medium text-gray-400 py-1"
          >
            {abbrev}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`blank-${idx}`} />;
          }

          const dateStr = toYMD(viewYear, viewMonth, day);
          const isPast = dateStr < todayStr;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;

          let cellClass =
            "mx-auto w-8 h-8 flex items-center justify-center rounded-full text-sm cursor-pointer select-none transition-colors ";

          if (isPast) {
            cellClass += "text-gray-300 cursor-not-allowed";
          } else if (isSelected) {
            cellClass += "bg-blue-500 text-white font-semibold";
          } else if (isToday) {
            cellClass += "bg-gray-800 text-white font-semibold hover:bg-gray-700";
          } else {
            cellClass += "text-gray-700 hover:bg-blue-50";
          }

          return (
            <div key={dateStr}>
              <div
                className={cellClass}
                onClick={() => {
                  if (!isPast) onSelectDate(dateStr);
                }}
              >
                {day}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
