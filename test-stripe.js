const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

async function test() {
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'qar',
          unit_amount: 1000,
          product_data: {
            name: 'Test',
          },
        },
        quantity: 1,
      },
    ],
    success_url: 'http://localhost:3000/success',
    cancel_url: 'http://localhost:3000/cancel',
  });

  console.log('Session payment_intent:', session.payment_intent);
  if (session.payment_intent) {
    const pi = await stripe.paymentIntents.retrieve(session.payment_intent);
    console.log('PI client secret:', pi.client_secret);
  }
}
test().catch(console.error);
