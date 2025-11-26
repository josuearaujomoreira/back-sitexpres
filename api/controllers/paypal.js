// paypal.js
import checkoutNodeJssdk from '@paypal/checkout-server-sdk';
import 'dotenv/config';


// Usa ambiente de produção
const environment = new checkoutNodeJssdk.core.LiveEnvironment(
  process.env.PAYPAL_CLIENT_ID,
  process.env.PAYPAL_CLIENT_SECRET
);

const client = new checkoutNodeJssdk.core.PayPalHttpClient(environment);

export default client;
