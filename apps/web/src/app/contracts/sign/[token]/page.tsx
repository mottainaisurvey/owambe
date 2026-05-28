'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  CheckCircle, AlertTriangle, Pen, Type, Loader2,
  FileText, Calendar, MapPin, DollarSign, Shield,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || '/api';

type SignMode = 'draw' | 'type';

function formatNGN(n: number) {
  return `₦${Number(n).toLocaleString('en-NG')}`;
}

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Signature canvas ────────────────────────────────
function SignatureCanvas({ onChange }: { onChange: (data: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    drawing.current = true;
    hasDrawn.current = true;
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1C1528';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function stop() {
    drawing.current = false;
    if (hasDrawn.current) {
      onChange(canvasRef.current!.toDataURL());
    }
  }

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
    onChange('');
  }

  return (
    <div>
      <div style={{
        border: '1.5px solid #E5E0F0', borderRadius: 8,
        background: '#FFFFFF', position: 'relative', overflow: 'hidden',
      }}>
        <canvas
          ref={canvasRef}
          width={560}
          height={140}
          style={{ width: '100%', height: 140, cursor: 'crosshair', touchAction: 'none', display: 'block' }}
          onMouseDown={start}
          onMouseMove={draw}
          onMouseUp={stop}
          onMouseLeave={stop}
          onTouchStart={start}
          onTouchMove={draw}
          onTouchEnd={stop}
        />
        <div style={{
          position: 'absolute', bottom: 8, left: 12,
          fontSize: 11, color: '#8B82A0', pointerEvents: 'none',
        }}>
          Sign above
        </div>
      </div>
      <button onClick={clear} style={{
        marginTop: 6, fontSize: 12, color: '#8B82A0',
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
      }}>
        Clear
      </button>
    </div>
  );
}

export default function SignContractPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [signMode, setSignMode] = useState<SignMode>('draw');
  const [signatureData, setSignatureData] = useState('');
  const [typedName, setTypedName] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [signed, setSigned] = useState(false);
  const [allSigned, setAllSigned] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['sign-token', token],
    queryFn: () => axios.get(`${API}/contracts/sign/${token}`).then(r => r.data),
    retry: false,
  });

  // Track when user has scrolled to the bottom of the contract
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    function onScroll() {
      if (el!.scrollTop + el!.clientHeight >= el!.scrollHeight - 40) {
        setScrolledToBottom(true);
      }
    }
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [data]);

  const signMutation = useMutation({
    mutationFn: () => axios.post(`${API}/contracts/sign/${token}`, {
      signatureData: signMode === 'draw' ? signatureData : `TYPED:${typedName}`,
      agreedToTerms: true,
    }),
    onSuccess: (res) => {
      setSigned(true);
      setAllSigned(res.data.allSigned);
      toast.success('✅ Contract signed successfully!');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Signing failed. Please try again.');
    },
  });

  function handleSign() {
    const hasSignature = signMode === 'draw' ? signatureData : typedName.trim().length >= 2;
    if (!hasSignature) { toast.error('Please provide your signature'); return; }
    if (!agreedToTerms) { toast.error('Please agree to the terms'); return; }
    signMutation.mutate();
  }

  // Loading
  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 size={32} style={{ margin: '0 auto 12px', display: 'block', color: '#6C2BD9' }} className="animate-spin" />
          <p style={{ color: '#8B82A0', fontSize: 14 }}>Loading contract...</p>
        </div>
      </div>
    );
  }

  // Error states
  if (error) {
    const msg = (error as any).response?.data?.error || 'Something went wrong';
    const isExpired = msg.includes('expired');
    const isAlreadySigned = msg.includes('already signed');
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>{isAlreadySigned ? '✅' : isExpired ? '⏰' : '❌'}</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: '#1C1528' }}>
            {isAlreadySigned ? 'Already Signed' : isExpired ? 'Link Expired' : 'Link Invalid'}
          </h1>
          <p style={{ color: '#8B82A0', fontSize: 14, lineHeight: 1.6 }}>{msg}</p>
          {isExpired && (
            <p style={{ color: '#8B82A0', fontSize: 13, marginTop: 12 }}>
              Contact the contract sender to request a new signing link.
            </p>
          )}
        </div>
      </div>
    );
  }

  const { signature: sig, contract } = data;

  // Success state
  if (signed) {
    return (
      <div style={{ minHeight: '100vh', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 480, width: '100%', background: '#fff', borderRadius: 16, padding: 40, border: '1px solid #E5E0F0', textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <CheckCircle size={32} color="#059669" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8, color: '#1C1528' }}>
            Contract Signed!
          </h1>
          <p style={{ color: '#8B82A0', fontSize: 15, lineHeight: 1.6, marginBottom: 20 }}>
            {allSigned
              ? 'All parties have signed. A fully executed copy has been emailed to everyone.'
              : 'Your signature has been recorded. Waiting for the other party to sign.'}
          </p>
          <div style={{ background: '#FAF9FC', borderRadius: 10, padding: 16, marginBottom: 24, textAlign: 'left' }}>
            <div style={{ fontSize: 12, color: '#8B82A0', marginBottom: 4 }}>Contract</div>
            <div style={{ fontWeight: 700, color: '#1C1528', fontSize: 15 }}>{contract.title}</div>
            <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#8B82A0', marginTop: 4 }}>{contract.reference}</div>
          </div>
          <div style={{
            background: '#EEF7F2', borderRadius: 10, padding: 14,
            fontSize: 13, color: '#6C2BD9', textAlign: 'left', lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>🔐 Signature recorded</div>
            Your signature, timestamp, and IP address have been securely recorded and are admissible as evidence
            of your intent to be bound by this agreement under Nigerian law.
          </div>
        </div>
      </div>
    );
  }

  const plannerSig = contract.signatures.find((s: any) => s.signerRole === 'PLANNER');
  const vendorSig = contract.signatures.find((s: any) => s.signerRole === 'VENDOR');
  const otherParty = sig.signerRole === 'PLANNER' ? 'the Vendor' : 'the Client';
  const myRole = sig.signerRole === 'PLANNER' ? 'Client' : 'Service Provider';

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Top nav */}
      <div style={{
        background: '#6C2BD9', padding: '0 24px', height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileText size={16} color="rgba(255,255,255,0.8)" />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>owambe.com</span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>/ Document Signing</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Shield size={13} color="rgba(255,255,255,0.6)" />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>256-bit encrypted · legally binding</span>
        </div>
      </div>

      {/* Signer banner */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #E5E0F0',
        padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 8,
      }}>
        <div>
          <span style={{ fontSize: 12, color: '#8B82A0' }}>Signing as </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1528' }}>{sig.signerName}</span>
          <span style={{ fontSize: 12, color: '#8B82A0' }}> · {myRole}</span>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {[plannerSig, vendorSig].map((s: any) => s && (
            <div key={s.signerRole} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: s.isSigned ? '#059669' : '#F59E0B',
              }} />
              <span style={{ color: '#8B82A0' }}>
                {s.signerRole === 'PLANNER' ? 'Client' : 'Vendor'}:
              </span>
              <span style={{ fontWeight: 600, color: s.isSigned ? '#059669' : '#92400E' }}>
                {s.isSigned ? 'Signed ✓' : 'Awaiting'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 80px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>

        {/* Contract body */}
        <div>
          {/* Contract meta */}
          <div style={{ background: '#fff', border: '1px solid #E5E0F0', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ background: '#1C1528', padding: '16px 20px' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                {contract.templateType?.replace(/_/g, ' ')}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>{contract.title}</div>
              <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>{contract.reference}</div>
            </div>
            <div style={{ padding: '14px 20px', display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {contract.eventDate && (
                <div style={{ display: 'flex', gap: 6, fontSize: 13, alignItems: 'center', color: '#8B82A0' }}>
                  <Calendar size={13} color="#6C2BD9" />
                  {formatDate(contract.eventDate)}
                </div>
              )}
              {contract.eventVenue && (
                <div style={{ display: 'flex', gap: 6, fontSize: 13, alignItems: 'center', color: '#8B82A0' }}>
                  <MapPin size={13} color="#6C2BD9" />
                  {contract.eventVenue}
                </div>
              )}
              {contract.totalAmount && (
                <div style={{ display: 'flex', gap: 6, fontSize: 13, alignItems: 'center', color: '#8B82A0' }}>
                  <DollarSign size={13} color="#6C2BD9" />
                  {formatNGN(Number(contract.totalAmount))}
                </div>
              )}
            </div>
          </div>

          {/* Read indicator */}
          {!scrolledToBottom && (
            <div style={{
              background: '#FEF3C7', border: '1px solid #FDE68A',
              borderRadius: 8, padding: '10px 14px', marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#92400E',
            }}>
              <AlertTriangle size={14} color="#F59E0B" style={{ flexShrink: 0 }} />
              Please scroll through and read the full contract before signing.
            </div>
          )}

          {/* Contract HTML body */}
          <div
            ref={bodyRef}
            style={{
              background: '#fff', border: '1px solid #E5E0F0', borderRadius: 12,
              height: 520, overflowY: 'auto', padding: '4px 0',
            }}
            dangerouslySetInnerHTML={{ __html: contract.bodyHtml }}
          />
        </div>

        {/* Signing panel — sticky */}
        <div style={{ position: 'sticky', top: 72 }}>
          <div style={{
            background: '#fff', border: '1px solid #E5E0F0', borderRadius: 12,
            overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          }}>
            {/* Panel header */}
            <div style={{ background: '#6C2BD9', padding: '16px 20px' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 2 }}>Your Signature</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>Signing as: {sig.signerName}</div>
            </div>

            <div style={{ padding: 20 }}>
              {/* Mode toggle */}
              <div style={{ display: 'flex', background: '#FAF9FC', borderRadius: 8, padding: 3, marginBottom: 16 }}>
                {(['draw', 'type'] as SignMode[]).map(mode => (
                  <button key={mode} onClick={() => { setSignMode(mode); setSignatureData(''); setTypedName(''); }}
                    style={{
                      flex: 1, padding: '7px 0', borderRadius: 6, border: 'none',
                      background: signMode === mode ? '#fff' : 'transparent',
                      fontWeight: 700, fontSize: 12, cursor: 'pointer',
                      color: signMode === mode ? '#1C1528' : '#8B82A0',
                      boxShadow: signMode === mode ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      transition: 'all 0.15s',
                    }}>
                    {mode === 'draw' ? <Pen size={12} /> : <Type size={12} />}
                    {mode === 'draw' ? 'Draw' : 'Type'}
                  </button>
                ))}
              </div>

              {signMode === 'draw' ? (
                <SignatureCanvas onChange={setSignatureData} />
              ) : (
                <div>
                  <input
                    value={typedName}
                    onChange={e => setTypedName(e.target.value)}
                    placeholder="Type your full name..."
                    style={{
                      width: '100%', padding: '10px 14px',
                      border: '1.5px solid #E5E0F0', borderRadius: 8,
                      fontSize: 22, fontFamily: 'Georgia, serif', fontStyle: 'italic',
                      color: '#1C1528', background: '#FFFFFF', outline: 'none',
                    }}
                  />
                  <div style={{ fontSize: 11, color: '#8B82A0', marginTop: 6 }}>
                    Typing your name constitutes your electronic signature
                  </div>
                </div>
              )}

              {/* Agree */}
              <label style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                marginTop: 16, padding: '12px 14px',
                background: agreedToTerms ? '#EEF7F2' : '#FAF9FC',
                borderRadius: 8, transition: 'background 0.15s',
              }}>
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={e => setAgreedToTerms(e.target.checked)}
                  style={{ marginTop: 2, accentColor: '#6C2BD9', flexShrink: 0 }}
                />
                <span style={{ fontSize: 12, color: '#3D3452', lineHeight: 1.5 }}>
                  I have read and agree to the terms of this contract and consent to signing electronically.
                  My signature is legally binding.
                </span>
              </label>

              {/* Sign button */}
              <button
                onClick={handleSign}
                disabled={
                  signMutation.isPending ||
                  !agreedToTerms ||
                  (signMode === 'draw' ? !signatureData : typedName.trim().length < 2)
                }
                style={{
                  width: '100%', marginTop: 14, padding: '14px 0',
                  background: agreedToTerms && (signMode === 'draw' ? signatureData : typedName.trim().length >= 2)
                    ? '#C9A227' : '#E5E0F0',
                  color: '#fff', fontWeight: 800, fontSize: 15,
                  borderRadius: 10, border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'background 0.2s',
                }}>
                {signMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                Sign Contract
              </button>

              {/* Trust footer */}
              <div style={{ marginTop: 14, fontSize: 11, color: '#8B82A0', textAlign: 'center', lineHeight: 1.6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
                  <Shield size={11} />
                  256-bit encrypted · timestamp & IP recorded
                </div>
                Your signature is legally binding under the Nigerian Communications Act.
                Owambe maintains an audit trail for 7 years.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
