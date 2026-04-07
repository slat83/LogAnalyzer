export default function Card({
  title,
  value,
  sub,
}: {
  title: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
      <div className="text-xs md:text-sm text-gray-400 mb-1">{title}</div>
      <div className="text-lg md:text-2xl font-bold text-white break-words">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}
