import { Link } from 'react-router-dom';
import { Brand } from '../components/ui';
import { useSession, homeFor } from '../lib/session';

export function NotFound() {
  const { user } = useSession();
  return (
    <div className="canvas-dots" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="col center gap-16" style={{ textAlign: 'center' }}>
        <Brand />
        <div className="display" style={{ fontSize: 'clamp(72px, 11vw, 128px)', color: 'var(--ink-4)' }}>
          4<em style={{ color: 'var(--lichen)' }}>0</em>4
        </div>
        <p className="lead">This page is out of plumb — it doesn't exist or has moved.</p>
        <Link to={user ? homeFor(user.role) : '/'} className="btn btn-primary">Return to level ground</Link>
      </div>
    </div>
  );
}
