// M-Pesa Payment Integration Service
import axios from 'axios';

export interface MpesaCredentials {
  consumerKey: string;
  consumerSecret: string;
  businessShortCode: string;
  passkey: string;
  environment: 'sandbox' | 'production';
}

export interface MpesaPaymentRequest {
  phoneNumber: string;
  amount: number;
  accountReference: string;
  transactionDesc: string;
  callbackUrl: string;
}

export interface MpesaPaymentResponse {
  merchantRequestID: string;
  checkoutRequestID: string;
  responseCode: string;
  responseDescription: string;
  customerMessage: string;
}

export interface MpesaCallbackData {
  merchantRequestID: string;
  checkoutRequestID: string;
  resultCode: number;
  resultDesc: string;
  amount?: number;
  mpesaReceiptNumber?: string;
  transactionDate?: string;
  phoneNumber?: string;
}

export class MpesaService {
  private credentials: MpesaCredentials;
  private baseUrl: string;
  private accessToken: string | null = null;
  private tokenExpiryTime: number = 0;

  constructor(credentials: MpesaCredentials) {
    this.credentials = credentials;
    this.baseUrl = credentials.environment === 'production' 
      ? 'https://api.safaricom.co.ke' 
      : 'https://sandbox.safaricom.co.ke';
  }

  /**
   * Generate M-Pesa access token
   */
  private async generateAccessToken(): Promise<string> {
    try {
      // Check if current token is still valid (with 5-minute buffer)
      if (this.accessToken && Date.now() < this.tokenExpiryTime - 300000) {
        return this.accessToken;
      }

      const auth = Buffer.from(
        `${this.credentials.consumerKey}:${this.credentials.consumerSecret}`
      ).toString('base64');

      const response = await axios.get(
        `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.access_token) {
        this.accessToken = response.data.access_token;
        // M-Pesa tokens expire in 1 hour
        this.tokenExpiryTime = Date.now() + (parseInt(response.data.expires_in) * 1000);
        return this.accessToken!;  // We know it's not null here
      }

      throw new Error('Failed to generate access token');
    } catch (error: any) {
      console.error('M-Pesa token generation error:', error);
      throw new Error(`M-Pesa authentication failed: ${error.response?.data?.errorMessage || error.message}`);
    }
  }

  /**
   * Generate M-Pesa password for STK Push
   */
  private generatePassword(): string {
    const timestamp = this.getTimestamp();
    const password = Buffer.from(
      `${this.credentials.businessShortCode}${this.credentials.passkey}${timestamp}`
    ).toString('base64');
    return password;
  }

  /**
   * Generate timestamp in M-Pesa format (YYYYMMDDHHMMSS)
   */
  private getTimestamp(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  /**
   * Initiate STK Push payment
   */
  async initiateSTKPush(paymentRequest: MpesaPaymentRequest): Promise<MpesaPaymentResponse> {
    try {
      const accessToken = await this.generateAccessToken();
      const timestamp = this.getTimestamp();
      const password = this.generatePassword();

      // Format phone number (ensure it starts with 254)
      let phoneNumber = paymentRequest.phoneNumber.replace(/\D/g, '');
      if (phoneNumber.startsWith('0')) {
        phoneNumber = '254' + phoneNumber.substring(1);
      } else if (phoneNumber.startsWith('7') || phoneNumber.startsWith('1')) {
        phoneNumber = '254' + phoneNumber;
      }

      const stkPushData = {
        BusinessShortCode: this.credentials.businessShortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: paymentRequest.amount,
        PartyA: phoneNumber,
        PartyB: this.credentials.businessShortCode,
        PhoneNumber: phoneNumber,
        CallBackURL: paymentRequest.callbackUrl,
        AccountReference: paymentRequest.accountReference,
        TransactionDesc: paymentRequest.transactionDesc
      };

      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        stkPushData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.ResponseCode === '0') {
        return {
          merchantRequestID: response.data.MerchantRequestID,
          checkoutRequestID: response.data.CheckoutRequestID,
          responseCode: response.data.ResponseCode,
          responseDescription: response.data.ResponseDescription,
          customerMessage: response.data.CustomerMessage
        };
      } else {
        throw new Error(`M-Pesa STK Push failed: ${response.data.ResponseDescription}`);
      }
    } catch (error: any) {
      console.error('M-Pesa STK Push error:', error);
      throw new Error(`M-Pesa payment initiation failed: ${error.response?.data?.errorMessage || error.message}`);
    }
  }

  /**
   * Query STK Push payment status
   */
  async querySTKPushStatus(checkoutRequestID: string): Promise<any> {
    try {
      const accessToken = await this.generateAccessToken();
      const timestamp = this.getTimestamp();
      const password = this.generatePassword();

      const queryData = {
        BusinessShortCode: this.credentials.businessShortCode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestID
      };

      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpushquery/v1/query`,
        queryData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('M-Pesa status query error:', error);
      throw new Error(`M-Pesa status query failed: ${error.response?.data?.errorMessage || error.message}`);
    }
  }

  /**
   * Validate M-Pesa callback data
   */
  static validateCallbackData(callbackData: any): MpesaCallbackData {
    const body = callbackData.Body?.stkCallback || callbackData;
    
    const validatedData: MpesaCallbackData = {
      merchantRequestID: body.MerchantRequestID,
      checkoutRequestID: body.CheckoutRequestID,
      resultCode: body.ResultCode,
      resultDesc: body.ResultDesc
    };

    // If payment was successful (ResultCode = 0), extract additional data
    if (body.ResultCode === 0 && body.CallbackMetadata) {
      const metadata = body.CallbackMetadata.Item || [];
      
      metadata.forEach((item: any) => {
        switch (item.Name) {
          case 'Amount':
            validatedData.amount = item.Value;
            break;
          case 'MpesaReceiptNumber':
            validatedData.mpesaReceiptNumber = item.Value;
            break;
          case 'TransactionDate':
            validatedData.transactionDate = item.Value?.toString();
            break;
          case 'PhoneNumber':
            validatedData.phoneNumber = item.Value?.toString();
            break;
        }
      });
    }

    return validatedData;
  }

  /**
   * Format phone number for M-Pesa (254XXXXXXXXX)
   */
  static formatPhoneNumber(phoneNumber: string): string {
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    if (cleaned.startsWith('0')) {
      return '254' + cleaned.substring(1);
    } else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
      return '254' + cleaned;
    } else if (cleaned.startsWith('254')) {
      return cleaned;
    }
    
    throw new Error('Invalid phone number format. Please use 0XXXXXXXXX or 254XXXXXXXXX');
  }

  /**
   * Validate phone number
   */
  static isValidKenyanPhone(phoneNumber: string): boolean {
    const formatted = phoneNumber.replace(/\D/g, '');
    
    // Check if it's a valid Kenyan mobile number
    return /^(254[17][0-9]{8}|0[17][0-9]{8}|[17][0-9]{8})$/.test(formatted);
  }
}
