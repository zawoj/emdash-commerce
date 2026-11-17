// The keys of the CMS address; the form renders the ones the caller gives content for, in this order.
export const addressFieldKeys = {
  firstName: 'firstName',
  lastName: 'lastName',
  company: 'company',
  taxId: 'taxId',
  street: 'street',
  houseNumber: 'houseNumber',
  apartmentNumber: 'apartmentNumber',
  postalCode: 'postalCode',
  city: 'city',
  country: 'country',
  phone: 'phone',
  email: 'email',
} as const
export type AddressFieldKey = (typeof addressFieldKeys)[keyof typeof addressFieldKeys]

export const addressFieldOrder: readonly AddressFieldKey[] = Object.values(addressFieldKeys)
