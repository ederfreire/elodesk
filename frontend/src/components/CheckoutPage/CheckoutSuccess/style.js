import styled from 'styled-components';

export const Container = styled.div`
  footer {
    margin-top: 30px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;

    @media (max-width: 768px) {
      flex-direction: column;
      .checkout-buttons {
        display: flex;
        flex-direction: column-reverse;
        width: 100%;

        button {
          width: 100%;
          margin-top: 16px;
          margin-left: 0;
        }
      }
    }

    button {
      margin-left: 16px;
    }
  }
`;

export const Total = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px 0;
  margin-bottom: 8px;
  border-bottom: 1px solid rgba(0,0,0,0.08);

  span {
    color: inherit;
    opacity: 0.5;
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  strong {
    font-size: 28px;
    font-weight: 800;
  }

  @media (max-width: 768px) {
    min-width: 100%;
    justify-content: center;
  }
`;

export const SuccessContent = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 12px 0;

  > h2 {
    text-align: center;
  }

  > svg {
    margin-top: 16px;
    border-radius: 8px;
    padding: 8px;
  }

  > span {
    margin-top: 16px;
    text-align: center;
    font-size: 13px;
    line-height: 1.6;
    opacity: 0.7;
    max-width: 360px;
  }

  > p,
  strong {
    margin-top: 8px;
    font-size: 9px;
    opacity: 0.5;
  }

  .copy-button {
    font-size: 13px;
    cursor: pointer;
    text-align: center;
    user-select: none;
    min-height: 44px;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    background: var(--primary-color, #1976d2);
    color: #fff;
    -webkit-appearance: none !important;
    outline: none;
    margin-top: 12px;
    width: 240px;
    font-weight: 700;
    text-transform: uppercase;
    border: none;
    border-radius: 8px;
    letter-spacing: 0.5px;
    transition: opacity 0.2s;

    &:hover {
      opacity: 0.9;
    }

    > span {
      margin-right: 8px;
    }
  }
`;

export const CheckoutWrapper = styled.div`
  width: 100%;
  margin: 0 auto 0;
  max-width: 1110px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 50px 95px;
  @media (max-width: 768px) {
    padding: 16px 24px;
  }
`;
