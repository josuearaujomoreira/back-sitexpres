import client from './paypal.js';
import checkoutNodeJssdk from '@paypal/checkout-server-sdk';

export async function createOrder(req, res) {
  try {
    const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "BRL",
            value: "49.90"
          }
        }
      ],
      application_context: {
        return_url: "https://seusite.com/paypal/sucesso",
        cancel_url: "https://seusite.com/paypal/cancelado"
      }
    });

    const response = await client.execute(request);

    return res.json({
      id: response.result.id,
      approve: response.result.links.find(l => l.rel === "approve").href
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao criar pedido" });
  }
}

export async function captureOrder(req, res) {
  try {
    const { token } = req.query;

    const request = new checkoutNodeJssdk.orders.OrdersCaptureRequest(token);
    request.requestBody({});

    const response = await client.execute(request);

    // Aqui o pagamento foi realizado com sucesso
    console.log("Pagamento aprovado:", response.result);

    return res.json(response.result);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao capturar pagamento" });
  }
}