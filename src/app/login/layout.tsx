export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
      {children}
    </div>
  );
}
