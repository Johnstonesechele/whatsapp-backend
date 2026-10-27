import crypto from 'crypto'

export interface SAMLConfig {
  ssoUrl: string
  sloUrl?: string
  entityId: string
  x509Certificate: string
  metadataUrl?: string
}

export interface SAMLAuthRequest {
  id: string
  issueInstant: string
  assertionConsumerServiceUrl: string
  issuer: string
  nameIdPolicy: string
  authnRequestXml: string
}

export interface SAMLUserAttributes {
  email: string
  firstName: string
  lastName: string
  role?: string
  department?: string
  groups?: string[]
  nameId: string
  sessionIndex?: string
}

const XML_NS = {
  samlp: 'urn:oasis:names:tc:SAML:2.0:protocol',
  saml: 'urn:oasis:names:tc:SAML:2.0:assertion',
  ds: 'http://www.w3.org/2000/09/xmldsig#'
}

function generateId(): string {
  return `_id-${crypto.randomBytes(16).toString('hex')}`
}

function generateIssueInstant(): string {
  return new Date().toISOString()
}

export function createAuthnRequest(
  config: SAMLConfig,
  acsUrl: string,
  relayState?: string
): SAMLAuthRequest {
  const id = generateId()
  const issueInstant = generateIssueInstant()

  const authnRequestXml = `
    <samlp:AuthnRequest
      xmlns:samlp="${XML_NS.samlp}"
      xmlns:saml="${XML_NS.saml}"
      ID="${id}"
      Version="2.0"
      IssueInstant="${issueInstant}"
      Destination="${config.ssoUrl}"
      AssertionConsumerServiceURL="${acsUrl}"
      ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
      <saml:Issuer>${config.entityId}</saml:Issuer>
      <samlp:NameIDPolicy
        Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
        AllowCreate="true" />
    </samlp:AuthnRequest>
  `.trim()

  return { id, issueInstant, assertionConsumerServiceUrl: acsUrl, issuer: config.entityId, nameIdPolicy: 'emailAddress', authnRequestXml }
}

export function buildLoginRedirectUrl(config: SAMLConfig, acsUrl: string, relayState?: string): string {
  const request = createAuthnRequest(config, acsUrl)
  const encodedRequest = Buffer.from(request.authnRequestXml).toString('base64')

  const params = new URLSearchParams({
    SAMLRequest: encodedRequest,
  })
  if (relayState) params.set('RelayState', relayState)

  return `${config.ssoUrl}?${params.toString()}`
}

export function buildLogoutRedirectUrl(config: SAMLConfig, nameId: string, sessionIndex?: string): string {
  const id = generateId()
  const issueInstant = generateIssueInstant()

  const logoutRequestXml = `
    <samlp:LogoutRequest
      xmlns:samlp="${XML_NS.samlp}"
      xmlns:saml="${XML_NS.saml}"
      ID="${id}"
      Version="2.0"
      IssueInstant="${issueInstant}"
      Destination="${config.sloUrl}">
      <saml:Issuer>${config.entityId}</saml:Issuer>
      <saml:NameID>${nameId}</saml:NameID>
      ${sessionIndex ? `<samlp:SessionIndex>${sessionIndex}</samlp:SessionIndex>` : ''}
    </samlp:LogoutRequest>
  `.trim()

  const encodedRequest = Buffer.from(logoutRequestXml).toString('base64')
  return `${config.sloUrl}?SAMLRequest=${encodedRequest}`
}

export function parseSAMLResponse(
  responseBase64: string,
  config: SAMLConfig,
  expectedAudience: string
): SAMLUserAttributes {
  const responseXml = Buffer.from(responseBase64, 'base64').toString('utf-8')

  validateCertificate(responseXml, config.x509Certificate)
  validateTimestamps(responseXml)
  validateAudience(responseXml, expectedAudience)

  const nameId = extractValue(responseXml, 'NameID')
  if (!nameId) throw new Error('SAML response missing NameID')

  const sessionIndex = extractAttributeFromStatement(responseXml, 'SessionIndex')

  const attributeStatements = extractAttributeStatements(responseXml)

  const email = attributeStatements.email || nameId
  const firstName = attributeStatements.first_name || attributeStatements.given_name || ''
  const lastName = attributeStatements.last_name || attributeStatements.family_name || ''
  const role = attributeStatements.role || attributeStatements.roles
  const department = attributeStatements.department
  const groups = attributeStatements.groups
    ? (typeof attributeStatements.groups === 'string' ? [attributeStatements.groups] : attributeStatements.groups)
    : []

  return { email, firstName, lastName, role, department, groups, nameId, sessionIndex: sessionIndex || undefined }
}

function extractValue(xml: string, tag: string): string | null {
  const regex = new RegExp(`<[^>]*:${tag}[^>]*>([^<]*)<[^>]*:${tag}>`, 'i')
  const match = xml.match(regex)
  return match ? match[1].trim() : null
}

function extractAttributeFromStatement(xml: string, attributeName: string): string | null {
  const regex = new RegExp(
    `<[^>]*Attribute[^>]*Name="[^"]*${attributeName}[^"]*"[^>]*>\\s*<[^>]*:AttributeValue[^>]*>([^<]*)</[^>]*:AttributeValue>`,
    'i'
  )
  const match = xml.match(regex)
  return match ? match[1].trim() : null
}

function extractAttributeStatements(xml: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const regex = /<[^>]*Attribute[^>]*Name="([^"]*)"[^>]*>\s*<[^>]*:AttributeValue[^>]*>([^<]*)<\/[^>]*:AttributeValue>/gi
  let match
  while ((match = regex.exec(xml)) !== null) {
    attributes[match[1]] = match[2].trim()
  }
  return attributes
}

function validateCertificate(xml: string, certificatePem: string): void {
  const certMatch = certificatePem.match(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/)
  if (!certMatch) throw new Error('Invalid certificate format')

  const publicKey = crypto.createPublicKey(certificatePem)

  const signatureMatch = xml.match(/<ds:SignatureValue>([^<]+)<\/ds:SignatureValue>/)
  if (!signatureMatch) throw new Error('No signature found in SAML response')

  const signedInfoMatch = xml.match(/<ds:SignedInfo>([\s\S]*?)<\/ds:SignedInfo>/)
  if (!signedInfoMatch) throw new Error('No SignedInfo found in SAML response')

  const signedInfoCanonical = signedInfoMatch[1]
    .replace(/\s+/g, ' ')
    .trim()

  const signatureValue = Buffer.from(signatureMatch[1], 'base64')
  const data = Buffer.from(signedInfoCanonical)

  const valid = crypto.verify('sha256', data, publicKey, signatureValue)

  if (!valid) throw new Error('SAML signature validation failed')
}

function validateTimestamps(xml: string): void {
  const notBefore = extractAttributeFromStatement(xml, 'NotBefore') ||
    extractValue(xml, 'NotBefore')
  const notOnOrAfter = extractAttributeFromStatement(xml, 'NotOnOrAfter') ||
    extractValue(xml, 'NotOnOrAfter')

  const now = new Date()

  if (notBefore && new Date(notBefore) > now) {
    throw new Error('SAML assertion not yet valid (NotBefore)')
  }
  if (notOnOrAfter && new Date(notOnOrAfter) <= now) {
    throw new Error('SAML assertion has expired (NotOnOrAfter)')
  }
}

function validateAudience(xml: string, expectedAudience: string): void {
  const audience = extractValue(xml, 'Audience')
  if (audience && audience !== expectedAudience) {
    throw new Error(`SAML audience mismatch: expected ${expectedAudience}, got ${audience}`)
  }
}

export function generateSPMetadata(
  entityId: string,
  acsUrl: string,
  sloUrl?: string,
  certificate?: string
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${entityId}">
  <SPSSODescriptor
    AuthnRequestsSigned="true"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${acsUrl}"
      index="0"
      isDefault="true" />
    ${sloUrl ? `
    <SingleLogoutService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
      Location="${sloUrl}" />` : ''}
    ${certificate ? `
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>${certificate.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, '')}</X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>` : ''}
  </SPSSODescriptor>
</EntityDescriptor>`
}
