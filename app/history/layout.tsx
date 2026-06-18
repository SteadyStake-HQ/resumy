export default function HistoryLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <style>{`
        header[data-app-navbar="true"] {
          display: none !important;
        }
      `}</style>
      {children}
    </>
  );
}
