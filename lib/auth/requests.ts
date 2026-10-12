type State = {error?: string;message?: string};
type SignupRequest = (input:{email:string;password:string;options:{emailRedirectTo:string}})=>Promise<{data:{session:unknown|null};error:{code?:string}|null}>;
type RecoveryRequest = (email:string,options:{redirectTo:string})=>Promise<{error:unknown|null}>;

const signupErrors: Record<string,string> = {
  over_email_send_rate_limit: 'The email sending limit has been reached. Please try again later.',
  over_request_rate_limit: 'Too many registration attempts. Please try again later.',
  signup_disabled: 'New account registration is disabled for this project.',
  email_provider_disabled: 'Email registration is disabled for this project.',
  email_address_not_authorized: 'This project’s email service cannot send to this address yet. Contact the project administrator.',
  email_address_invalid: 'Supabase rejected this email address. Please use a valid email address.',
  weak_password: 'Your password does not meet this project’s strength requirements. Please choose a stronger password.',
  captcha_failed: 'This project requires CAPTCHA verification, which is not configured in this app yet.',
};

// Provider boundary permits deterministic failure tests without sending mail or
// exhausting a provider. Exactly one provider request; errors never imply login.
export async function requestSignup(request:SignupRequest,email:string,password:string,emailRedirectTo:string):Promise<{signedIn:boolean;state:State}> {
  const result = await request({email,password,options:{emailRedirectTo}});
  if (result.error) return {signedIn:false,state:{error:signupErrors[result.error.code??'']??'Unable to create an account. Please try again or sign in if you already have one.'}};
  if (result.data.session) return {signedIn:true,state:{}};
  return {signedIn:false,state:{message:'Check your email for a confirmation link, then sign in. If you already have an account, use sign-in or password reset.'}};
}

export async function requestRecovery(request:RecoveryRequest,email:string,redirectTo:string):Promise<State> {
  const result = await request(email,{redirectTo});
  if (result.error) return {error:'Unable to send a reset email right now. Please try again later.'};
  return {message:'If an account exists for this email, you will receive a password reset link.'};
}
