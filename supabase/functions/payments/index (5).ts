import { serve } from 'https://deno.land/std@0.195.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

serve(async req => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!bearerToken) {
    return new Response(JSON.stringify({ error: 'Authorization token is required' }), { status: 401 });
  }

  const { data: authData, error: authErr } = await supabase.auth.getUser(bearerToken);
  if (authErr || !authData?.user) {
    return new Response(JSON.stringify({ error: authErr?.message || 'Unable to verify authentication token' }), { status: 401 });
  }

  const callerUserId = authData.user.id;
  const payload = await req.json();
  const { studentId, parentId, schoolId, amount, txRef, transactionId } = payload || {};

  if (!schoolId || !amount || (!transactionId && !txRef)) {
    return new Response(JSON.stringify({ error: 'Missing payment details' }), { status: 400 });
  }

  const flutterSecret = Deno.env.get('FLUTTERWAVE_SECRET_KEY');
  if (!flutterSecret) {
    return new Response(JSON.stringify({ error: 'Payment gateway is not configured on the server.' }), { status: 500 });
  }

  let authorized = false;
  const parentCheck = await supabase
    .from('parents')
    .select('id, school_id')
    .eq('id', parentId)
    .eq('user_id', callerUserId)
    .single();

  if (!parentCheck.error && parentCheck.data) {
    authorized = true;
    if (parentCheck.data.school_id !== schoolId) {
      return new Response(JSON.stringify({ error: 'Parent school mismatch' }), { status: 403 });
    }
  }

  if (!authorized) {
    const adminCheck = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', callerUserId)
      .eq('school_id', schoolId)
      .eq('role', 'school_admin')
      .single();

    if (!adminCheck.error && adminCheck.data) {
      authorized = true;
    }
  }

  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Not authorized to record payment for this school or parent' }), { status: 403 });
  }

  const verificationPath = transactionId || txRef;
  const verifyResponse = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(verificationPath)}/verify`, {
    headers: {
      Authorization: `Bearer ${flutterSecret}`,
      'Content-Type': 'application/json'
    }
  });

  const verification = await verifyResponse.json();
  if (!verifyResponse.ok || verification?.status !== 'success' || verification?.data?.status !== 'successful') {
    return new Response(JSON.stringify({ error: 'Payment verification failed' }), { status: 402 });
  }

  if (Number(verification.data.amount) !== Number(amount)) {
    return new Response(JSON.stringify({ error: 'Payment amount mismatch' }), { status: 400 });
  }

  if (txRef && verification.data.tx_ref && verification.data.tx_ref !== txRef) {
    return new Response(JSON.stringify({ error: 'Payment reference mismatch' }), { status: 400 });
  }

  const payloadRow = {
    student_id: studentId || null,
    parent_id: parentId || null,
    school_id: schoolId,
    amount,
    status: 'paid',
    method: payload.method || 'flutterwave',
    payment_type: payload.paymentType || 'school_fee',
    description: payload.description || 'School fee payment',
    metadata: payload.metadata || {},
    tx_ref: txRef,
    processed_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from('payments').insert([payloadRow]).select().single();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ data }), { status: 201 });
});
