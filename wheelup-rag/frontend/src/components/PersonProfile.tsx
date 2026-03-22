interface Props {
  name: string;
  company?: string;
  role?: string;
  traits?: Record<string, string>;
}

export default function PersonProfile({ name, company, role, traits }: Props) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-700 font-bold text-sm">
          {name.slice(0, 2)}
        </div>
        <div>
          <h4 className="font-semibold text-gray-900">{name}</h4>
          <p className="text-xs text-gray-500">
            {company && <span>{company}</span>}
            {role && <span> / {role}</span>}
          </p>
        </div>
      </div>

      {traits && Object.keys(traits).length > 0 && (
        <div className="mt-3 space-y-1">
          {Object.entries(traits).map(([key, value]) => (
            <div key={key} className="flex text-xs">
              <span className="w-24 flex-shrink-0 font-medium text-gray-500">
                {key}
              </span>
              <span className="text-gray-700">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
