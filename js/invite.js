function inviteShowMessage(text, type = 'info') {
  if (typeof window !== 'undefined' && typeof window.showMessage === 'function') {
    return window.showMessage(text, type);
  }

  if (!text) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

document.addEventListener('DOMContentLoaded', async () => {
  const token = new URLSearchParams(window.location.search).get('token');
  if (!token) {
    document.getElementById('inviteTitle').textContent = 'Invite token not found';
    document.getElementById('inviteIntro').textContent = 'Please use the link sent to your email to access this page.';
    document.getElementById('inviteForm').querySelector('button').disabled = true;
    return;
  }

  const result = await verifyInviteToken(token);
  if (result.error) {
    document.getElementById('inviteTitle').textContent = 'Invalid invite';
    document.getElementById('inviteIntro').textContent = result.error.message;
    document.getElementById('inviteForm').querySelector('button').disabled = true;
    return;
  }

  const inviteData = result.data;
  document.getElementById('inviteTitle').textContent = `Welcome, ${inviteData.role}`;
  document.getElementById('inviteIntro').textContent = `Create a password to access your ${inviteData.role} portal at your school.`;
  document.getElementById('inviteRole').textContent = `Role: ${inviteData.role}`;
  document.getElementById('inviteSchool').textContent = `School ID: ${inviteData.school_id || 'Unknown'}`;
  document.getElementById('inviteStudent').textContent = inviteData.role === 'parent'
    ? `Student ID: ${inviteData.student_id}`
    : `Assigned class: ${inviteData.classes || 'Not assigned yet'}`;

  document.getElementById('inviteForm').addEventListener('submit', async event => {
    event.preventDefault();
    const password = document.getElementById('invitePassword').value;
    const confirmPassword = document.getElementById('inviteConfirmPassword').value;
    if (!password || password !== confirmPassword) {
      inviteShowMessage('Please enter a matching password.', 'error');
      return;
    }

    const acceptResult = await acceptInvite(token, password);
    if (acceptResult.error) {
      inviteShowMessage(acceptResult.error.message || 'Unable to activate your account.', 'error');
      return;
    }

    inviteShowMessage('Your account is active. Please log in.', 'success');
    window.location.href = 'login.html';
  });
});
