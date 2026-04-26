import { Modal } from 'antd';

export function showStripeCheckoutErrorModal(): void {
  Modal.error({
    title: 'Checkout unavailable',
    content: 'Something went wrong starting checkout. Please try again in a moment.',
    okText: 'OK',
    centered: true,
  });
}

export function showStripePortalErrorModal(): void {
  Modal.error({
    title: 'Billing unavailable',
    content: 'Something went wrong opening the billing page. Please try again in a moment.',
    okText: 'OK',
    centered: true,
  });
}
