/**
 * Every user-facing string in the app lives here, in both languages.
 * `Dictionary` is the single source of truth: TypeScript will refuse to
 * compile ar.ts or en.ts if either one is missing a key the other has, or
 * has an extra one — so a future addition that only ships one language
 * simply won't build. When adding a new page/feature, add its strings to
 * this interface first, then fill in both dictionaries/ar.ts and en.ts.
 */
export interface Dictionary {
  meta: {
    title: string;
    description: string;
  };
  common: {
    save: string;
    delete: string;
    cancel: string;
    view: string;
    edit: string;
    optional: string;
    none: string;
    yes: string;
    no: string;
  };
  roles: {
    OWNER: string;
    ADMIN: string;
    MANAGER: string;
    ACCOUNTANT: string;
    VIEWER: string;
  };
  nav: {
    dashboard: string;
    properties: string;
    compounds: string;
    buildings: string;
    floors: string;
    units: string;
    owners: string;
    renters: string;
    contracts: string;
    collections: string;
    invoices: string;
    payments: string;
    reports: string;
    auditLogs: string;
    crmGroupLabel: string;
    crmDashboard: string;
    crmLeads: string;
    crmPipeline: string;
    crmReports: string;
    crmViewings: string;
    crmViewingCalendar: string;
    crmOffers: string;
    crmReservations: string;
    operationsGroupLabel: string;
    operationsDashboard: string;
    operationsMoveIns: string;
    operationsMaintenanceRequests: string;
    operationsMaintenanceWorkOrders: string;
    operationsMaintenanceVendors: string;
    operationsMaintenanceReports: string;
    operationsMoveOuts: string;
    operationsReports: string;
    operationsSettlements: string;
    settings: string;
    signOut: string;
    brandTagline: string;
    openMenu: string;
    closeMenu: string;
  };
  login: {
    title: string;
    tagline: string;
    subtitle: string;
    error: string;
    email: string;
    password: string;
    submit: string;
    seedHint: string;
  };
  dashboard: {
    title: string;
    subtitle: string;
    occupancyRate: string;
    occupancyHint: (occupied: number, total: number) => string;
    activeContracts: string;
    totalCollected: string;
    totalCollectedHint: (total: string) => string;
    overdueAmount: string;
    overdueHint: (count: number) => string;
    chartTitle: string;
    chartInvoiced: string;
    chartCollected: string;
    overduePanelTitle: string;
    viewAll: string;
    noOverdue: string;
    dueOn: (date: string) => string;
    vatTitle: string;
    vatHint: string;
    expiringPanelTitle: string;
    expiringHint: (days: number) => string;
    noExpiring: string;
    expiresOn: (date: string) => string;
    unclosedPanelTitle: string;
    unclosedHint: string;
    noUnclosed: string;
    endedOn: (date: string) => string;
    viewContracts: string;
    hierarchyPanelTitle: string;
    totalCompounds: string;
    totalBuildings: string;
    totalFloors: string;
    totalUnitsCount: string;
    occupancyByCompoundTitle: string;
    occupancyByCompoundEmpty: string;
  };
  compoundStatus: {
    PLANNING: string;
    UNDER_CONSTRUCTION: string;
    ACTIVE: string;
    INACTIVE: string;
  };
  ownerType: {
    INDIVIDUAL: string;
    COMPANY: string;
    FUND: string;
    GOVERNMENT_ENTITY: string;
    OTHER: string;
  };
  ownerStatus: {
    ACTIVE: string;
    INACTIVE: string;
  };
  ownershipStatus: {
    ACTIVE: string;
    ENDED: string;
  };
  ownerLedgerEntryType: {
    RENT_INCOME: string;
    OTHER_INCOME: string;
    MANAGEMENT_FEE: string;
    MAINTENANCE_EXPENSE: string;
    UTILITY_EXPENSE: string;
    SERVICE_EXPENSE: string;
    GOVERNMENT_FEE: string;
    OTHER_EXPENSE: string;
    OWNER_CONTRIBUTION: string;
    OWNER_DISTRIBUTION: string;
    ADJUSTMENT: string;
    REVERSAL: string;
  };
  propertyType: {
    RESIDENTIAL: string;
    COMMERCIAL: string;
    MIXED: string;
  };
  unitType: {
    APARTMENT: string;
    VILLA: string;
    OFFICE: string;
    SHOP: string;
    WAREHOUSE: string;
    OTHER: string;
  };
  unitStatus: {
    VACANT: string;
    OCCUPIED: string;
    MAINTENANCE: string;
    RESERVED: string;
  };
  idType: {
    NATIONAL_ID: string;
    IQAMA: string;
    COMMERCIAL_REGISTRATION: string;
    PASSPORT: string;
    GCC_ID: string;
  };
  paymentFrequency: {
    MONTHLY: string;
    QUARTERLY: string;
    SEMI_ANNUAL: string;
    ANNUAL: string;
    ONE_TIME: string;
  };
  contractStatus: {
    DRAFT: string;
    ACTIVE: string;
    EXPIRED: string;
    TERMINATED: string;
    RENEWED: string;
  };
  scheduleStatus: {
    PENDING: string;
    PARTIALLY_INVOICED: string;
    INVOICED: string;
    PAID: string;
    PARTIALLY_PAID: string;
    OVERDUE: string;
    CANCELLED: string;
  };
  invoiceStatus: {
    DRAFT: string;
    ISSUED: string;
    PARTIALLY_PAID: string;
    PAID: string;
    OVERDUE: string;
    CANCELLED: string;
  };
  invoiceKind: {
    STANDARD: string;
    SIMPLIFIED: string;
  };
  paymentMethod: {
    CASH: string;
    BANK_TRANSFER: string;
    CHEQUE: string;
    CARD: string;
    ONLINE: string;
  };
  properties: {
    title: string;
    subtitle: string;
    addNew: string;
    fieldNameEn: string;
    fieldNameAr: string;
    fieldType: string;
    fieldCity: string;
    fieldDistrict: string;
    fieldStreet: string;
    save: string;
    colProperty: string;
    colType: string;
    colLocation: string;
    colUnitsCount: string;
    delete: string;
    empty: string;
  };
  locationPicker: {
    compound: string;
    building: string;
    floor: string;
  };
  compounds: {
    title: string;
    subtitle: string;
    addNew: string;
    fieldName: string;
    fieldArabicName: string;
    fieldDescription: string;
    fieldAddress: string;
    fieldCity: string;
    fieldLocation: string;
    fieldLatitude: string;
    fieldLongitude: string;
    fieldOwnerName: string;
    fieldManagerName: string;
    fieldAmenities: string;
    fieldStatus: string;
    save: string;
    colName: string;
    colCity: string;
    colBuildings: string;
    colFloors: string;
    colUnits: string;
    colStatus: string;
    delete: string;
    empty: string;
  };
  buildings: {
    title: string;
    subtitle: string;
    addNew: string;
    fieldCompound: string;
    fieldCode: string;
    fieldName: string;
    fieldNameAr: string;
    fieldDescription: string;
    fieldNumberOfFloors: string;
    save: string;
    colName: string;
    colCompound: string;
    colFloors: string;
    delete: string;
    empty: string;
  };
  floors: {
    title: string;
    subtitle: string;
    addNew: string;
    fieldBuilding: string;
    fieldFloorNumber: string;
    fieldName: string;
    fieldNameAr: string;
    save: string;
    colName: string;
    colBuilding: string;
    colCompound: string;
    colUnits: string;
    delete: string;
    empty: string;
  };
  units: {
    title: string;
    subtitle: string;
    addNew: string;
    fieldProperty: string;
    fieldUnitNumber: string;
    fieldFloor: string;
    fieldUnitType: string;
    fieldArea: string;
    fieldBedrooms: string;
    fieldBathrooms: string;
    fieldBaseRent: string;
    fieldVatApplicable: string;
    save: string;
    colUnit: string;
    colProperty: string;
    colType: string;
    colBaseRent: string;
    colStatus: string;
    colCurrentRenter: string;
    delete: string;
    empty: string;
  };
  owners: {
    title: string;
    subtitle: string;
    addNew: string;
    searchPlaceholder: string;
    fieldOwnerType: string;
    fieldName: string;
    fieldNameAr: string;
    fieldNationalId: string;
    fieldIqamaNumber: string;
    fieldPassportNumber: string;
    fieldCompanyRegistrationNumber: string;
    fieldVatNumber: string;
    fieldEmail: string;
    fieldMobile: string;
    fieldAlternateMobile: string;
    fieldAddress: string;
    fieldCity: string;
    fieldCountry: string;
    fieldBankName: string;
    fieldBankAccountName: string;
    fieldIban: string;
    fieldNotes: string;
    save: string;
    colName: string;
    colType: string;
    colMobile: string;
    colStatus: string;
    view: string;
    edit: string;
    deactivate: string;
    reactivate: string;
    delete: string;
    empty: string;
    profile: {
      back: string;
      editTitle: string;
      infoTitle: string;
      balanceLabel: string;
      totalIncomeLabel: string;
      totalExpensesLabel: string;
      totalDistributionsLabel: string;
      ownedAssetsTitle: string;
      ownedAssetsEmpty: string;
      colAsset: string;
      colOwnershipPercent: string;
      recentLedgerTitle: string;
      recentLedgerEmpty: string;
      viewFullStatement: string;
      documentsPlaceholderTitle: string;
      documentsPlaceholderBody: string;
      postEntryTitle: string;
    };
  };
  ownership: {
    title: string;
    subtitle: string;
    addOwner: string;
    fieldOwner: string;
    fieldPercentage: string;
    fieldEffectiveFrom: string;
    fieldNotes: string;
    save: string;
    colOwner: string;
    colPercentage: string;
    colEffectiveFrom: string;
    colEffectiveTo: string;
    colStatus: string;
    endOwnership: string;
    activeTotalLabel: (total: string) => string;
    activeTotalUnder100: string;
    effectiveOwnersTitle: string;
    noEffectiveOwners: string;
    inheritedFromCompound: string;
    inheritedFromBuilding: string;
    historyTitle: string;
    empty: string;
  };
  ownerLedger: {
    postEntry: string;
    fieldEntryType: string;
    fieldSide: string;
    debitLabel: string;
    creditLabel: string;
    fieldAmount: string;
    fieldEntryDate: string;
    fieldDescription: string;
    fieldDescriptionAr: string;
    submit: string;
    allocateTitle: string;
    fieldAssetLevel: string;
    fieldAsset: string;
    allocateSubmit: string;
    assetLevelCompound: string;
    assetLevelBuilding: string;
    assetLevelUnit: string;
    colDate: string;
    colReference: string;
    colDescription: string;
    colDebit: string;
    colCredit: string;
    colBalance: string;
    reverse: string;
    reversalOf: string;
    empty: string;
  };
  renters: {
    title: string;
    subtitle: string;
    addNew: string;
    fieldFullName: string;
    fieldFullNameAr: string;
    fieldIdType: string;
    fieldIdNumber: string;
    fieldVatNumber: string;
    fieldPhone: string;
    fieldEmail: string;
    fieldAddress: string;
    save: string;
    colName: string;
    colIdType: string;
    colIdNumber: string;
    colVatNumber: string;
    individualBadge: string;
    colContact: string;
    delete: string;
    empty: string;
  };
  contracts: {
    title: string;
    subtitle: string;
    addNew: string;
    fieldUnit: string;
    fieldRenter: string;
    addNewUnitToggle: string;
    addNewRenterToggle: string;
    fieldFrequency: string;
    fieldStartDate: string;
    fieldEndDate: string;
    fieldRentAmount: string;
    fieldSecurityDeposit: string;
    fieldCommission: string;
    fieldCleaning: string;
    fieldExtraChargesMode: string;
    extraChargesModeOneTime: string;
    extraChargesModeSplit: string;
    extraChargesHint: string;
    fieldVatApplicable: string;
    fieldNotes: string;
    save: string;
    colContractNumber: string;
    colUnit: string;
    colRenter: string;
    colTerm: string;
    colInstallment: string;
    colStatus: string;
    extraFeesBadge: string;
    terminate: string;
    renew: string;
    edit: string;
    empty: string;
    unitOptionLabel: (property: string, unitNumber: string) => string;
    renewPage: {
      title: string;
      subtitle: (contractNumber: string) => string;
      unitLabel: string;
      renterLabel: string;
      back: string;
      submit: string;
    };
    editPage: {
      title: string;
      subtitle: (contractNumber: string) => string;
      back: string;
      submit: string;
      lockedNotice: string;
    };
  };
  collections: {
    title: string;
    subtitle: string;
    colRenter: string;
    colUnit: string;
    colInstallment: string;
    colDueDate: string;
    colAmount: string;
    colStatus: string;
    viewInvoice: string;
    issueInvoice: string;
    fullyInvoiced: string;
    empty: string;
    searchPlaceholder: string;
    issuePage: {
      title: string;
      subtitle: (renter: string, unit: string) => string;
      dueOn: (date: string) => string;
      componentRent: string;
      componentCommission: string;
      componentCleaning: string;
      componentSecurityDeposit: string;
      noComponents: string;
      back: string;
      submit: string;
    };
  };
  invoices: {
    title: string;
    subtitle: string;
    colInvoiceNumber: string;
    colKind: string;
    colCustomer: string;
    colIssueDate: string;
    colTotal: string;
    colStatus: string;
    viewInvoice: string;
    empty: string;
  };
  invoiceDetail: {
    back: string;
    downloadXml: string;
    vatNumberLabel: string;
    taxInvoiceSimplified: string;
    taxInvoiceStandard: string;
    customer: string;
    contractLine: (contractNumber: string, unitNumber: string, property: string) => string;
    qrCaption: string;
    colDescription: string;
    colQuantity: string;
    colUnitPrice: string;
    colVat: string;
    colTotal: string;
    subtotal: string;
    vatAmount: string;
    totalDue: string;
    paidAmount: string;
    remaining: string;
    zatcaStatusLabel: string;
    recordPaymentTitle: string;
    fieldAmount: string;
    fieldMethod: string;
    fieldReference: string;
    recordPaymentSubmit: string;
    paymentsHistoryTitle: string;
    cancelInvoice: string;
  };
  payments: {
    title: string;
    subtitle: string;
    colReceiptNumber: string;
    colRenter: string;
    colInvoice: string;
    colMethod: string;
    colDate: string;
    colAmount: string;
    colStatus: string;
    reverse: string;
    empty: string;
  };
  paymentStatus: {
    POSTED: string;
    REVERSED: string;
  };
  settings: {
    title: string;
    subtitle: string;
    fieldLogo: string;
    logoHint: string;
    changeLogo: string;
    fieldNameEn: string;
    fieldNameAr: string;
    fieldCommercialRegistration: string;
    fieldVatNumber: string;
    fieldCity: string;
    fieldDistrict: string;
    fieldStreet: string;
    fieldBuildingNumber: string;
    fieldPostalCode: string;
    fieldPhone: string;
    fieldEmail: string;
    save: string;
    zatcaNoteTitle: string;
    zatcaNoteBody: string;
  };
  printButton: string;
  languageSwitcher: {
    label: string;
    ar: string;
    en: string;
  };
  validation: {
    nameRequired: string;
    unitNumberRequired: string;
    floorRequired: string;
    rentAmountPositive: string;
    installmentAmountPositive: string;
    contractEndAfterStart: string;
    invoiceAlreadyIssued: string;
    selectAtLeastOneComponent: string;
    unitAlreadyOccupied: string;
    notAuthorized: string;
    paymentExceedsRemaining: (remaining: string) => string;
    logoTooLarge: string;
    logoInvalidType: string;
    ownerHasHistory: string;
    ownershipExceeds100: (total: string) => string;
    ownershipAssetRequired: string;
    ledgerAlreadyReversed: string;
    paymentAlreadyReversed: string;
    leadMobileRequired: string;
    leadInvalidStatusTransition: string;
    lostReasonNoteRequired: string;
    leadAlreadyConverted: string;
    possibleDuplicateRenter: string;
    viewingEndAfterStart: string;
    viewingAtLeastOneUnit: string;
    viewingLeadNotEligible: string;
    viewingUnitNotEligible: string;
    viewingInvalidTransition: string;
    viewingCancelReasonNoteRequired: string;
    offerValidUntilAfterFrom: string;
    offerLeadNotEligible: string;
    offerUnitNotEligible: string;
    offerViewingMismatch: string;
    offerInvalidTransition: string;
    offerCannotEditNonDraft: string;
    offerCannotRevise: string;
    offerApprovalNotAllowed: string;
    offerRejectReasonNoteRequired: string;
    reservationOfferNotAccepted: string;
    reservationOfferAlreadyActive: string;
    reservationUnitNotEligible: string;
    reservationUnitConflict: string;
    reservationHoldUntilFuture: string;
    reservationInvalidTransition: string;
    reservationCancelReasonNoteRequired: string;
    reservationCannotEdit: string;
    reservationNotConfirmedForConversion: string;
    reservationOfferMismatch: string;
    offerMissingLeaseStartDate: string;
    moveInContractNotEligible: string;
    moveInAlreadyExistsForContract: string;
    moveInInvalidTransition: string;
    moveInNotEditable: string;
    moveInChecklistIncomplete: string;
    moveInCompletionMissingRequirements: string;
    moveInOverrideReasonRequired: string;
    moveInCancelNoteRequired: string;
    maintenanceUnitRequired: string;
    maintenanceUnitNotFound: string;
    maintenanceBuildingRequired: string;
    maintenanceBuildingMustNotHaveUnit: string;
    maintenanceBuildingNotFound: string;
    maintenanceCompoundRequired: string;
    maintenanceCompoundMustNotHaveBuildingOrUnit: string;
    maintenanceCompoundNotFound: string;
    maintenanceContractMismatch: string;
    maintenanceRenterMismatch: string;
    maintenanceRenterRequiresContract: string;
    maintenanceInvalidTransition: string;
    maintenanceWorkOrderAlreadyExists: string;
    maintenanceOneResponsiblePartyOnly: string;
    maintenanceVendorInactive: string;
    maintenanceScheduleEndAfterStart: string;
    maintenanceScheduleOverlap: string;
    maintenanceCancelReasonRequired: string;
    maintenanceHoldReasonRequired: string;
    maintenanceCompletionMissingRequirements: string;
    maintenanceWorkOrderLocked: string;
    maintenancePartQuantityPositive: string;
    maintenanceLaborHoursNonNegative: string;
    maintenanceAmountNonNegative: string;
    moveOutContractNotEligible: string;
    moveOutAlreadyExistsForContract: string;
    moveOutInvalidTransition: string;
    moveOutNotEditable: string;
    moveOutFindingsReviewIncomplete: string;
    moveOutFindingsNotYetReviewed: string;
    moveOutCompletionMissingRequirements: string;
    moveOutOverrideReasonRequired: string;
    moveOutCancelNoteRequired: string;
    moveOutUnsafeToVacate: string;
    moveOutBlockedByActiveCorporateAllocations: string;
    contractTerminationBlockedByActiveCorporateAllocations: string;
    contractRenewalBlockedByMoveOut: string;
    settlementMoveOutNotEligible: string;
    settlementAlreadyExistsForMoveOut: string;
    settlementInvalidTransition: string;
    settlementNotEditable: string;
    settlementApprovalBlockedUndetermined: string;
    settlementApprovalBlockedDispute: string;
    settlementApprovedPlusWaivedExceedsProposed: string;
    settlementNonTenantCannotHaveApprovedAmount: string;
    settlementNegativeAmount: string;
    settlementNotApproved: string;
    settlementAlreadyPosted: string;
    settlementRefundExceedsRemaining: string;
    settlementRefundAmountInvalid: string;
    settlementCancelReasonRequired: string;
    documentFileRequired: string;
    documentFileEmpty: string;
    documentFileTooLarge: string;
    documentFileTypeNotAllowed: string;
    documentFileExtensionMismatch: string;
    documentFileSignatureMismatch: string;
    documentEntityNotFound: string;
    documentNotFound: string;
  };
  zatca: {
    notConfigured: string;
    pendingIntegration: string;
  };
  reports: {
    title: string;
    subtitle: string;
    backToReports: string;
    filterFrom: string;
    filterTo: string;
    filterApply: string;
    filterRenter: string;
    filterUnit: string;
    selectPlaceholder: string;
    searchPlaceholder: string;
    noResults: string;
    grandTotal: string;
    cards: {
      renterStatement: { title: string; description: string };
      unitStatement: { title: string; description: string };
      overdue: { title: string; description: string };
      activeContracts: { title: string; description: string };
      expiringContracts: { title: string; description: string };
      collections: { title: string; description: string };
      vat: { title: string; description: string };
      unitsByCompound: { title: string; description: string };
      buildingsByCompound: { title: string; description: string };
      vacancyByCompound: { title: string; description: string };
      ownerStatement: { title: string; description: string };
      ownerPortfolio: { title: string; description: string };
    };
    renterStatement: {
      title: string;
      colDate: string;
      colType: string;
      colReference: string;
      colDebit: string;
      colCredit: string;
      colBalance: string;
      invoiceEntry: string;
      paymentEntry: string;
      rentEntry: string;
      commissionEntry: string;
      cleaningEntry: string;
      depositEntry: string;
      balanceDue: string;
      renterLabel: string;
      annualRentLabel: string;
      contractTermLabel: string;
      noActiveContract: string;
      noSelection: string;
      empty: string;
    };
    unitStatement: {
      title: string;
      colDate: string;
      colType: string;
      colReference: string;
      colContract: string;
      colDebit: string;
      colCredit: string;
      colBalance: string;
      balanceDue: string;
      noSelection: string;
      empty: string;
    };
    overdue: {
      title: string;
      colRenter: string;
      colUnit: string;
      colDueDate: string;
      colDaysOverdue: string;
      colAmount: string;
      totalLabel: string;
      empty: string;
    };
    activeContracts: {
      title: string;
      colContractNumber: string;
      colRenter: string;
      colUnit: string;
      colStart: string;
      colEnd: string;
      colRentAmount: string;
      colFrequency: string;
      empty: string;
    };
    expiringContracts: {
      title: string;
      colContractNumber: string;
      colRenter: string;
      colUnit: string;
      colEndDate: string;
      colDaysLeft: string;
      empty: string;
    };
    collectionsReport: {
      title: string;
      colDate: string;
      colReceiptNumber: string;
      colRenter: string;
      colMethod: string;
      colAmount: string;
      totalLabel: string;
      empty: string;
    };
    vatReport: {
      title: string;
      colPeriod: string;
      colInvoiceCount: string;
      colSubtotal: string;
      colVat: string;
      colTotal: string;
      empty: string;
    };
    unitsByCompound: {
      title: string;
      colCompound: string;
      colBuildings: string;
      colFloors: string;
      colUnits: string;
      empty: string;
    };
    buildingsByCompound: {
      title: string;
      colCompound: string;
      colBuilding: string;
      colFloors: string;
      colUnits: string;
      empty: string;
    };
    vacancyByCompound: {
      title: string;
      colCompound: string;
      colTotalUnits: string;
      colVacantUnits: string;
      colVacancyRate: string;
      empty: string;
    };
    ownerStatement: {
      title: string;
      fieldOwner: string;
      fieldCompound: string;
      fieldUnit: string;
      colDate: string;
      colReference: string;
      colDescription: string;
      colDebit: string;
      colCredit: string;
      colBalance: string;
      openingBalance: string;
      totalIncome: string;
      totalExpenses: string;
      totalDistributions: string;
      closingBalance: string;
      noSelection: string;
      empty: string;
    };
    ownerPortfolio: {
      title: string;
      fieldOwner: string;
      colOwner: string;
      colCompound: string;
      colBuilding: string;
      colUnit: string;
      colOwnershipPercent: string;
      colAnnualRent: string;
      colOccupancy: string;
      colCurrentTenant: string;
      colLeaseEnd: string;
      empty: string;
    };
  };
  auditLogs: {
    title: string;
    subtitle: string;
    filterFrom: string;
    filterTo: string;
    filterUser: string;
    filterAction: string;
    filterEntityType: string;
    filterEntityId: string;
    filterFinancialOnly: string;
    searchPlaceholder: string;
    filterApply: string;
    colDate: string;
    colUser: string;
    colAction: string;
    colEntity: string;
    colChanges: string;
    colCategory: string;
    system: string;
    noChanges: string;
    empty: string;
    pageOf: (page: number, totalPages: number) => string;
    previous: string;
    next: string;
  };
  auditAction: {
    CREATE: string;
    UPDATE: string;
    DELETE: string;
    SOFT_DELETE: string;
    ACTIVATE: string;
    DEACTIVATE: string;
    APPROVE: string;
    REJECT: string;
    TERMINATE: string;
    RENEW: string;
    ISSUE: string;
    CANCEL: string;
    VOID: string;
    END: string;
    TRANSFER: string;
    PAYMENT_RECORDED: string;
    PAYMENT_REVERSED: string;
    OWNERSHIP_ASSIGNED: string;
    OWNERSHIP_ENDED: string;
    LEDGER_POSTED: string;
    LEDGER_REVERSED: string;
    LOGIN: string;
    LOGIN_FAILED: string;
    LOGOUT: string;
    PERMISSION_DENIED: string;
    ARCHIVE: string;
    RESTORE: string;
    DOWNLOAD: string;
  };
  auditTimeline: {
    title: string;
    empty: string;
    by: (name: string) => string;
  };
  leadType: {
    INDIVIDUAL: string;
    CORPORATE: string;
    AGENT_REFERRAL: string;
  };
  leadStatus: {
    NEW: string;
    CONTACTED: string;
    QUALIFIED: string;
    VIEWING_PENDING: string;
    VIEWING_COMPLETED: string;
    OFFER_PENDING: string;
    NEGOTIATION: string;
    RESERVATION_PENDING: string;
    WON: string;
    LOST: string;
    ARCHIVED: string;
  };
  leadSource: {
    FACEBOOK: string;
    INSTAGRAM: string;
    GOOGLE: string;
    WHATSAPP: string;
    WEBSITE: string;
    REFERRAL: string;
    WALK_IN: string;
    CORPORATE: string;
    AGENT: string;
    PHONE: string;
    OTHER: string;
  };
  furnishingPreference: {
    FURNISHED: string;
    SEMI_FURNISHED: string;
    UNFURNISHED: string;
    FLEXIBLE: string;
  };
  leadLostReason: {
    PRICE: string;
    NO_AVAILABILITY: string;
    LOCATION: string;
    COMPETITOR: string;
    NO_RESPONSE: string;
    BUDGET: string;
    TIMING: string;
    CUSTOMER_CANCELLED: string;
    OTHER: string;
  };
  leadActivityType: {
    CALL: string;
    WHATSAPP: string;
    EMAIL: string;
    MEETING: string;
    NOTE: string;
    FOLLOW_UP: string;
    STATUS_CHANGE: string;
    OTHER: string;
  };
  crm: {
    dashboardTitle: string;
    dashboardSubtitle: string;
    kpiActiveLeads: string;
    kpiNewLeads: string;
    kpiQualifiedLeads: string;
    kpiWonLeads: string;
    kpiLostLeads: string;
    kpiConversionRate: string;
    kpiFollowUpsToday: string;
    kpiFollowUpsOverdue: string;
    bySourceTitle: string;
    byAgentTitle: string;
    pipelineCountsTitle: string;

    activityStatusChanged: (from: string, to: string) => string;
    activityAssigned: (name: string) => string;
    activityUnassigned: string;
    activityMarkedLost: string;
    activityArchived: string;
    activityConverted: string;

    leadsTitle: string;
    leadsSubtitle: string;
    searchLabel: string;
    searchPlaceholder: string;
    colLeadNumber: string;
    colNameCompany: string;
    colMobile: string;
    colSource: string;
    colBudget: string;
    colBedrooms: string;
    colCompound: string;
    colMoveIn: string;
    colStatus: string;
    colAgent: string;
    colFollowUp: string;
    colCreated: string;
    colActions: string;
    filterStatus: string;
    filterSource: string;
    filterLeadType: string;
    filterAgent: string;
    filterCompound: string;
    filterMoveInFrom: string;
    filterMoveInTo: string;
    filterCreatedFrom: string;
    filterCreatedTo: string;
    filterFollowUp: string;
    filterApply: string;
    filterAll: string;
    followUpToday: string;
    followUpOverdue: string;
    followUpUpcoming: string;
    followUpNone: string;
    empty: string;
    previous: string;
    next: string;
    pageOf: (page: number, total: number) => string;

    newLeadTitle: string;
    newLeadSubtitle: string;
    save: string;
    sectionCustomerInfo: string;
    sectionHousingRequirements: string;
    sectionBudget: string;
    sectionMoveIn: string;
    sectionPreferredCompound: string;
    sectionLeadSource: string;
    sectionAssignedAgent: string;
    sectionNotes: string;
    sectionCorporate: string;
    fieldLeadType: string;
    fieldFirstName: string;
    fieldLastName: string;
    fieldCompanyName: string;
    fieldMobile: string;
    fieldAlternateMobile: string;
    fieldEmail: string;
    fieldNationality: string;
    fieldEmployer: string;
    fieldJobTitle: string;
    fieldContactPersonName: string;
    fieldContactPersonMobile: string;
    fieldContactPersonEmail: string;
    fieldEmployeeCount: string;
    fieldRequiredUnits: string;
    fieldRequestedCity: string;
    fieldProjectName: string;
    fieldHousingStartDate: string;
    fieldHousingEndDate: string;
    fieldFamilySize: string;
    fieldBudgetMin: string;
    fieldBudgetMax: string;
    fieldPreferredBedrooms: string;
    fieldPreferredUnitType: string;
    fieldPreferredCompound: string;
    fieldMoveInDate: string;
    fieldLeaseDurationMonths: string;
    fieldFurnishedPreference: string;
    fieldNotes: string;
    fieldSource: string;
    fieldAssignedAgent: string;
    unassigned: string;

    duplicateWarningTitle: string;
    duplicateWarningMobile: string;
    duplicateWarningEmail: string;
    duplicateWarningNone: string;

    profileBack: string;
    profileEditTitle: string;
    profileConvertTitle: string;
    profileConvertModeNew: string;
    profileConvertModeLink: string;
    profileConvertSelectRenter: string;
    profileConvertForce: string;
    profileConvertSubmit: string;
    profileMarkLostTitle: string;
    fieldLostReason: string;
    fieldLostReasonNote: string;
    profileMarkLostSubmit: string;
    profileAssignTitle: string;
    profileAssignSubmit: string;
    profileArchive: string;
    profileArchived: string;
    profileActivitiesTitle: string;
    profileAddActivityTitle: string;
    fieldActivityType: string;
    fieldActivitySubject: string;
    fieldActivityNotes: string;
    fieldActivityDate: string;
    fieldNextFollowUp: string;
    activitySave: string;
    activitiesEmpty: string;
    profileConversionTitle: string;
    profileConvertedTo: string;
    profileNotConverted: string;
    profileRequirementsTitle: string;
    profileBudgetTitle: string;
    profileContactTitle: string;
    profileSummaryTitle: string;

    pipelineTitle: string;
    pipelineSubtitle: string;
    pipelineMoveTo: string;

    reportsTitle: string;
    reportsSubtitle: string;
    reportPipeline: string;
    reportSource: string;
    reportConversion: string;
    reportAgentPerformance: string;
    reportLostAnalysis: string;
    conversionFormulaNote: string;
    conversionActiveNote: (count: number) => string;
    colWon: string;
    colLost: string;
    colConversionRate: string;
    colAssigned: string;
    colFollowUpsCompleted: string;
    colReason: string;
    colCount: string;
    colTotal: string;
  };
  viewingStatus: {
    SCHEDULED: string;
    CONFIRMED: string;
    IN_PROGRESS: string;
    COMPLETED: string;
    CANCELLED: string;
    NO_SHOW: string;
    RESCHEDULED: string;
  };
  viewingOutcome: {
    INTERESTED: string;
    FOLLOW_UP_REQUIRED: string;
    NOT_INTERESTED: string;
    OFFER_REQUESTED: string;
    RESERVATION_REQUESTED: string;
    OTHER: string;
  };
  viewingCancelReason: {
    CUSTOMER_REQUEST: string;
    AGENT_UNAVAILABLE: string;
    UNIT_UNAVAILABLE: string;
    RESCHEDULED: string;
    NO_RESPONSE: string;
    OTHER: string;
  };
  viewing: {
    conflictMessage: (viewingNumber: string, leadName: string, time: string, unitNumber?: string) => string;
    activityScheduled: (viewingNumber: string, time: string) => string;
    activityCompleted: (viewingNumber: string, outcomeLabel: string) => string;
    activityCancelled: (viewingNumber: string) => string;
    activityNoShow: (viewingNumber: string) => string;
    activityRescheduled: (viewingNumber: string, oldTime: string, newTime: string) => string;

    listTitle: string;
    listSubtitle: string;
    searchPlaceholder: string;
    colViewingNumber: string;
    colLead: string;
    colCompound: string;
    colUnits: string;
    colDate: string;
    colTime: string;
    colAgent: string;
    colStatus: string;
    colOutcome: string;
    colActions: string;
    filterStatus: string;
    filterOutcome: string;
    filterAgent: string;
    filterCompound: string;
    filterUnit: string;
    filterLead: string;
    filterDateFrom: string;
    filterDateTo: string;
    filterToday: string;
    filterTomorrow: string;
    filterThisWeek: string;
    filterMine: string;
    filterApply: string;
    filterAll: string;
    empty: string;
    previous: string;
    next: string;
    pageOf: (page: number, total: number) => string;

    newTitle: string;
    newSubtitle: string;
    save: string;
    fieldLead: string;
    fieldAssignedAgent: string;
    fieldScheduledStart: string;
    fieldScheduledEnd: string;
    fieldCustomerNotes: string;
    sectionUnits: string;
    addUnit: string;
    selectedUnitsTitle: string;
    removeUnit: string;
    noUnitsSelected: string;
    pickCompound: string;
    pickBuilding: string;
    pickFloor: string;
    pickUnit: string;

    profileBack: string;
    profileSummaryTitle: string;
    profileLeadTitle: string;
    profileScheduleTitle: string;
    profileAgentTitle: string;
    profileUnitsTitle: string;
    profileOutcomeTitle: string;
    profileFeedbackTitle: string;
    profileInternalNotesTitle: string;
    actionConfirm: string;
    actionStart: string;
    actionComplete: string;
    actionReschedule: string;
    actionCancel: string;
    actionNoShow: string;
    actionReassign: string;
    completeTitle: string;
    fieldOutcome: string;
    fieldFeedbackSummary: string;
    fieldInternalNotes: string;
    completeSubmit: string;
    cancelTitle: string;
    fieldCancelReason: string;
    fieldCancelReasonNote: string;
    cancelSubmit: string;
    rescheduleTitle: string;
    rescheduleSubmit: string;
    futureReservationPlaceholder: string;

    scheduleViewingButton: string;
    upcomingViewingsTitle: string;
    pastViewingsTitle: string;
    lastViewingOutcome: string;
    nextViewingDate: string;
    noUpcomingViewings: string;
    noPastViewings: string;

    calendarTitle: string;
    calendarSubtitle: string;
    calendarDay: string;
    calendarWeek: string;
    calendarEmpty: string;

    dashboardTitle: string;
    kpiTodayViewings: string;
    kpiUpcomingViewings: string;
    kpiCompletedThisMonth: string;
    kpiCancelled: string;
    kpiNoShows: string;
    kpiInterestRate: string;
    kpiOfferRequestRate: string;
    kpiReservationRequestRate: string;
    kpiCompletionRate: string;

    reportsTitle: string;
    reportSchedule: string;
    reportOutcome: string;
    reportAgentPerformance: string;
    reportMostViewedUnits: string;
    reportMostViewedCompounds: string;
    reportNoShowAnalysis: string;
    colScheduled: string;
    colCompleted: string;
    colCancelledCount: string;
    colNoShowCount: string;
    colInterested: string;
    colOfferRequested: string;
    colCompletionPercent: string;
    colViewCount: string;
    colLastViewing: string;

    unitViewingsLink: string;
  };
  offerStatus: {
    DRAFT: string;
    PENDING_APPROVAL: string;
    APPROVED: string;
    SENT: string;
    UNDER_NEGOTIATION: string;
    ACCEPTED: string;
    REJECTED: string;
    EXPIRED: string;
    CANCELLED: string;
    SUPERSEDED: string;
  };
  approvalStatus: {
    NOT_REQUIRED: string;
    PENDING: string;
    APPROVED: string;
    REJECTED: string;
  };
  offerRejectReason: {
    PRICE: string;
    PAYMENT_TERMS: string;
    UNIT: string;
    LOCATION: string;
    TIMING: string;
    COMPETITOR: string;
    CUSTOMER_CANCELLED: string;
    OTHER: string;
  };
  offer: {
    activityCreated: (offerNumber: string, netAnnualRent: number) => string;
    activitySent: (offerNumber: string) => string;
    activityNegotiation: (offerNumber: string) => string;
    activityAccepted: (offerNumber: string) => string;
    activityRejected: (offerNumber: string, reasonLabel: string) => string;
    activityCancelled: (offerNumber: string) => string;
    activityRevised: (offerNumber: string, versionNumber: number) => string;

    createOfferButton: string;
    createOfferFromLeadButton: string;
    offersFromViewingTitle: string;

    listTitle: string;
    listSubtitle: string;
    searchPlaceholder: string;
    colOfferNumber: string;
    colVersion: string;
    colVersionShort: string;
    colLead: string;
    colUnit: string;
    colCompound: string;
    colAnnualRent: string;
    colDiscount: string;
    colNetRent: string;
    colStatus: string;
    colAgent: string;
    colValidUntil: string;
    colCreatedDate: string;
    colActions: string;
    filterStatus: string;
    filterAgent: string;
    filterCompound: string;
    filterUnit: string;
    filterLead: string;
    filterDateFrom: string;
    filterDateTo: string;
    filterValidUntilFrom: string;
    filterValidUntilTo: string;
    filterExpiredOnly: string;
    filterAcceptedOnly: string;
    filterRejectedOnly: string;
    filterApply: string;
    filterAll: string;
    empty: string;
    previous: string;
    next: string;
    pageOf: (page: number, total: number) => string;

    newTitle: string;
    newSubtitle: string;
    editTitle: string;
    editSubtitle: string;
    save: string;
    fieldLead: string;
    fieldViewing: string;
    fieldUnit: string;
    fieldAssignedAgent: string;
    fieldValidFrom: string;
    fieldValidUntil: string;
    fieldAnnualRent: string;
    fieldDiscountAmount: string;
    fieldDiscountPercentage: string;
    fieldSecurityDeposit: string;
    fieldContractFee: string;
    fieldCommissionAmount: string;
    fieldCommissionRate: string;
    fieldCommissionVatRate: string;
    fieldPaymentFrequency: string;
    fieldLeaseStartDate: string;
    fieldLeaseDurationMonths: string;
    fieldFurnishedStatus: string;
    fieldSpecialTerms: string;
    fieldInternalNotes: string;
    pickCompound: string;
    pickBuilding: string;
    pickFloor: string;
    pickUnit: string;

    previewTitle: string;
    previewGrossAnnualRent: string;
    previewDiscount: string;
    previewNetAnnualRent: string;
    previewCommission: string;
    previewCommissionVat: string;
    previewDeposit: string;
    previewContractFee: string;
    previewInitialPayment: string;
    /** Template with {count}/{amount} placeholders, interpolated client-side in OfferPricingForm - a function value cannot cross the Server->Client Component prop boundary. */
    previewInstallmentsTemplate: string;

    profileBack: string;
    profileSummaryTitle: string;
    profileLeadTitle: string;
    profileUnitTitle: string;
    profilePricingTitle: string;
    profilePaymentTermsTitle: string;
    profileDepositTitle: string;
    profileCommissionTitle: string;
    profileVatTitle: string;
    profileSpecialTermsTitle: string;
    profileValidityTitle: string;
    profileStatusTitle: string;
    profileVersionHistoryTitle: string;
    profileActivitiesTitle: string;
    approvalStatusLabel: string;

    currentVersionBadge: string;

    actionSubmitForApproval: string;
    actionApprove: string;
    actionDeclineApproval: string;
    actionSend: string;
    actionMoveToNegotiation: string;
    actionAccept: string;
    actionReject: string;
    actionCancel: string;
    actionRevise: string;
    actionEdit: string;
    actionPrint: string;

    declineApprovalTitle: string;
    fieldDeclineNotes: string;
    declineApprovalSubmit: string;

    rejectTitle: string;
    fieldRejectReason: string;
    fieldRejectReasonNote: string;
    rejectSubmit: string;

    approvalRequiredBadge: string;
    approvalNotRequiredBadge: string;

    printTitle: string;
    printCustomer: string;
    printUnit: string;
    printCompound: string;
    printLeasePeriod: string;
    printRent: string;
    printPaymentSchedule: string;
    printDeposit: string;
    printCommission: string;
    printVat: string;
    printTerms: string;
    printValidity: string;

    dashboardTitle: string;
    kpiDraftOffers: string;
    kpiPendingApproval: string;
    kpiSentOffers: string;
    kpiNegotiations: string;
    kpiAcceptedThisMonth: string;
    kpiRejected: string;
    kpiExpired: string;
    kpiAcceptanceRate: string;
    kpiOpenOfferValue: string;
    kpiAcceptedOfferValue: string;

    reportsTitle: string;
    reportPipeline: string;
    reportAcceptance: string;
    reportDiscount: string;
    reportValueByCompound: string;
    reportAgentPerformance: string;
    reportRejectedAnalysis: string;
    colCount: string;
    colAverageDiscount: string;
    colEscalatedCount: string;
    colTotalValue: string;
    colAcceptedCount: string;
    colOfferCount: string;
    colReason: string;

    offersTitle: string;
    latestOfferLabel: string;
    offerStatusLabel: string;
    offerAmountLabel: string;
    offerValidUntilLabel: string;
    noOffers: string;
  };
  reservationStatus: {
    DRAFT: string;
    PENDING: string;
    CONFIRMED: string;
    EXPIRED: string;
    CANCELLED: string;
    RELEASED: string;
    CONVERTED_TO_CONTRACT: string;
  };
  reservationAmountStatus: {
    NOT_REQUIRED: string;
    PENDING: string;
    RECEIVED: string;
    REFUNDED: string;
    FORFEITED: string;
  };
  reservationCancelReason: {
    CUSTOMER_REQUEST: string;
    PAYMENT_NOT_RECEIVED: string;
    DOCUMENTS_INCOMPLETE: string;
    UNIT_CHANGED: string;
    OFFER_CHANGED: string;
    TIMEOUT: string;
    MANAGEMENT_DECISION: string;
    OTHER: string;
  };
  reservation: {
    activityCreated: (reservationNumber: string) => string;
    activityConfirmed: (reservationNumber: string) => string;
    activityCancelled: (reservationNumber: string) => string;
    activityReleased: (reservationNumber: string) => string;
    activityExpired: (reservationNumber: string) => string;
    activityContractCreated: (contractNumber: string, unitNumber: string) => string;

    createReservationButton: string;
    createReservationFromLeadButton: string;

    listTitle: string;
    listSubtitle: string;
    searchPlaceholder: string;
    colReservationNumber: string;
    colLead: string;
    colOfferNumber: string;
    colUnit: string;
    colCompound: string;
    colStatus: string;
    colAmount: string;
    colAmountStatus: string;
    colReservedAt: string;
    colHoldUntil: string;
    colAgent: string;
    colActions: string;
    filterStatus: string;
    filterAmountStatus: string;
    filterAgent: string;
    filterCompound: string;
    filterUnit: string;
    filterLead: string;
    filterHoldUntilFrom: string;
    filterHoldUntilTo: string;
    filterDateFrom: string;
    filterDateTo: string;
    filterExpiredOnly: string;
    filterExpiringToday: string;
    filterActiveOnly: string;
    filterApply: string;
    filterAll: string;
    empty: string;
    previous: string;
    next: string;
    pageOf: (page: number, total: number) => string;

    newTitle: string;
    newSubtitle: string;
    selectOfferTitle: string;
    noReservableOffers: string;
    save: string;
    fieldOffer: string;
    fieldHoldUntil: string;
    fieldReservationAmount: string;
    fieldAssignedAgent: string;
    fieldNotes: string;
    amountTrackingDisclaimer: string;

    profileBack: string;
    profileSummaryTitle: string;
    profileLeadTitle: string;
    profileOfferTitle: string;
    profileUnitTitle: string;
    profileHoldPeriodTitle: string;
    profileAmountTitle: string;
    profileCommercialSummaryTitle: string;
    profileInternalNotesTitle: string;
    profileActivitiesTitle: string;

    actionSubmit: string;
    actionConfirm: string;
    actionCancel: string;
    actionRelease: string;
    actionUpdateAmountStatus: string;
    actionCreateContract: string;

    cancelTitle: string;
    fieldCancelReason: string;
    fieldCancelReasonNote: string;
    cancelSubmit: string;

    updateAmountStatusTitle: string;
    fieldNewAmountStatus: string;
    updateAmountStatusSubmit: string;

    dashboardTitle: string;
    kpiActiveReservations: string;
    kpiConfirmedReservations: string;
    kpiExpiringToday: string;
    kpiExpiredThisMonth: string;
    kpiCancelled: string;
    kpiConversionPending: string;
    kpiAmountPending: string;
    kpiAmountReceived: string;

    reportsTitle: string;
    reportActive: string;
    reportExpiry: string;
    reportCancellationAnalysis: string;
    reportAmountStatus: string;
    reportByCompound: string;
    reportAgentPerformance: string;
    colCount: string;
    colReason: string;
    colTotalAmount: string;
    colConfirmationRate: string;

    reservedUnitLabel: string;
    noActiveReservation: string;
    reservationHistoryTitle: string;
    activeReservationTitle: string;

    unitReservedLabel: string;
    unitReservationNumberLabel: string;
    unitHoldUntilLabel: string;

    convertedContractLabel: string;
    convertedAtLabel: string;
    convertedRenterLabel: string;
    viewContractLink: string;
  };
  reservationContract: {
    createContractPageTitle: string;
    createContractPageSubtitle: (reservationNumber: string) => string;
    reviewTitle: string;
    reviewDisclaimer: string;
    fieldLeadTenant: string;
    fieldUnit: string;
    fieldCompound: string;
    fieldOfferNumber: string;
    fieldReservationNumber: string;
    fieldNetAnnualRent: string;
    fieldPaymentFrequency: string;
    fieldSecurityDeposit: string;
    fieldCommission: string;
    fieldVat: string;
    fieldContractFee: string;
    fieldContractFeeNote: string;
    fieldLeaseStart: string;
    fieldLeaseEnd: string;
    fieldSpecialTerms: string;
    back: string;
    submit: string;
    alreadyConverted: string;

    sourceTitle: string;
    sourceManual: string;
    sourceReservation: string;
    sourceReservationNumber: string;
    sourceOfferNumber: string;
    sourceLead: string;

    pipelineContractBadge: (contractNumber: string) => string;

    leadFunnelWonTitle: string;
    leadFunnelWonContract: string;
    leadFunnelWonUnit: string;
    leadFunnelWonLeaseStart: string;
    leadFunnelWonLeaseEnd: string;

    kpiContractsCreated: string;
    kpiConversionRate: string;

    funnelReportTitle: string;
    funnelReportSubtitle: string;
    funnelStageLead: string;
    funnelStageViewing: string;
    funnelStageOffer: string;
    funnelStageReservation: string;
    funnelStageContract: string;
    funnelColCount: string;
    funnelColConversion: string;

    originationReportTitle: string;
    originationReportSubtitle: string;
    colViewingNumber: string;
    colAnnualRent: string;
    colStartDate: string;
    colEndDate: string;
    colSource: string;
  };
  moveInStatus: Record<"DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "READY_FOR_HANDOVER" | "COMPLETED" | "CANCELLED", string>;
  moveInCancelReason: Record<"CONTRACT_CANCELLED" | "CUSTOMER_REQUEST" | "UNIT_NOT_READY" | "RESCHEDULED" | "DATA_ERROR" | "OTHER", string>;
  conditionRating: Record<"NEW" | "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "DAMAGED" | "NOT_WORKING" | "NOT_APPLICABLE", string>;
  inspectionCategory: Record<
    "ENTRANCE" | "LIVING_ROOM" | "DINING_ROOM" | "KITCHEN" | "BEDROOM" | "BATHROOM" | "BALCONY" | "WINDOWS_DOORS" | "FLOORING" | "WALLS_CEILINGS" | "LIGHTING" | "ELECTRICAL" | "PLUMBING" | "AIR_CONDITIONING" | "APPLIANCES" | "FURNITURE" | "SAFETY" | "OTHER",
    string
  >;
  meterType: Record<"ELECTRICITY" | "WATER" | "GAS" | "OTHER", string>;
  keyType: Record<"KEY" | "ACCESS_CARD" | "REMOTE" | "PARKING_REMOTE" | "OTHER", string>;
  missingRequirement: Record<
    "HANDOVER_DATE" | "INSPECTION_INCOMPLETE" | "REQUIRED_METERS_MISSING" | "KEYS_NOT_RECORDED" | "INVENTORY_REQUIRED_FOR_FURNISHED_UNIT" | "TENANT_ACKNOWLEDGEMENT_MISSING" | "STAFF_ACKNOWLEDGEMENT_MISSING",
    string
  >;
  maintenanceScopeType: Record<"UNIT" | "BUILDING_COMMON_AREA" | "COMPOUND_COMMON_AREA", string>;
  maintenanceCategory: Record<
    | "PLUMBING"
    | "ELECTRICAL"
    | "AIR_CONDITIONING"
    | "APPLIANCE"
    | "CARPENTRY"
    | "PAINTING"
    | "CIVIL"
    | "FLOORING"
    | "DOORS_WINDOWS"
    | "ELEVATOR"
    | "POOL"
    | "LANDSCAPING"
    | "PEST_CONTROL"
    | "CLEANING"
    | "FIRE_SAFETY"
    | "SECURITY_SYSTEM"
    | "INTERNET_TELECOM"
    | "GENERAL"
    | "OTHER",
    string
  >;
  maintenancePriority: Record<"LOW" | "NORMAL" | "HIGH" | "URGENT" | "EMERGENCY", string>;
  maintenanceRequestStatus: Record<"OPEN" | "TRIAGED" | "WORK_ORDER_CREATED" | "RESOLVED" | "CANCELLED", string>;
  maintenanceWorkOrderStatus: Record<"DRAFT" | "ASSIGNED" | "SCHEDULED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "VERIFIED" | "CLOSED" | "CANCELLED", string>;
  maintenanceRequestSource: Record<"INTERNAL" | "TENANT" | "MOVE_IN_INSPECTION" | "MOVE_OUT_INSPECTION" | "MANAGEMENT" | "SECURITY" | "HOUSEKEEPING" | "OTHER", string>;
  maintenanceReportedByType: Record<"STAFF" | "TENANT" | "OWNER" | "SECURITY" | "HOUSEKEEPING" | "MANAGEMENT" | "CORPORATE_OCCUPANT" | "OTHER", string>;
  maintenanceHoldReason: Record<"WAITING_FOR_PART" | "WAITING_FOR_VENDOR" | "WAITING_FOR_TENANT" | "WAITING_FOR_APPROVAL" | "ACCESS_UNAVAILABLE" | "OTHER", string>;
  maintenanceCancelReason: Record<"DUPLICATE" | "NOT_NEEDED" | "TENANT_WITHDREW" | "RESOLVED_INFORMALLY" | "DATA_ERROR" | "OTHER", string>;
  maintenanceWorkLogType: Record<"NOTE" | "STATUS_UPDATE" | "DIAGNOSIS" | "WORK_PERFORMED" | "CUSTOMER_UPDATE" | "INTERNAL_NOTE" | "OTHER", string>;
  maintenanceCostResponsibility: Record<"UNDETERMINED" | "OWNER" | "TENANT" | "PROPERTY_MANAGEMENT" | "WARRANTY" | "VENDOR" | "OTHER", string>;
  maintenanceAttachmentType: Record<"PHOTO" | "VIDEO" | "DOCUMENT" | "INVOICE_COPY" | "QUOTE" | "OTHER", string>;
  maintenanceAttachmentStage: Record<"BEFORE" | "DURING" | "AFTER" | "GENERAL", string>;
  maintenanceSlaStatus: Record<"ON_TRACK" | "AT_RISK" | "BREACHED" | "MET", string>;
  moveOutStatus: Record<"DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "PENDING_FINDINGS_REVIEW" | "READY_FOR_CLOSURE" | "COMPLETED" | "CANCELLED", string>;
  moveOutCancelReason: Record<"CONTRACT_REINSTATED" | "TENANT_REQUEST" | "RESCHEDULED" | "DATA_ERROR" | "OTHER", string>;
  conditionComparison: Record<"IMPROVED" | "UNCHANGED" | "DETERIORATED" | "NO_BASELINE" | "NOT_COMPARABLE", string>;
  moveOutMissingRequirement: Record<
    "VACATE_DATE_MISSING" | "INSPECTION_INCOMPLETE" | "FINDINGS_NOT_REVIEWED" | "REQUIRED_METERS_MISSING" | "KEYS_NOT_RECONCILED" | "TENANT_ACKNOWLEDGEMENT_MISSING" | "STAFF_ACKNOWLEDGEMENT_MISSING",
    string
  >;
  inventoryDiffStatus: Record<"MATCHED" | "QUANTITY_MISMATCH" | "MISSING_AT_MOVE_OUT" | "ADDED_AT_MOVE_OUT", string>;
  settlementStatus: Record<"DRAFT" | "UNDER_REVIEW" | "PENDING_APPROVAL" | "APPROVED" | "POSTED" | "PARTIALLY_SETTLED" | "SETTLED" | "CANCELLED", string>;
  settlementResponsibility: Record<"TENANT" | "OWNER" | "PROPERTY_MANAGEMENT" | "VENDOR" | "WARRANTY" | "UNDETERMINED" | "NO_CHARGE" | "OTHER", string>;
  settlementDeductionCategory: Record<"DAMAGE" | "MISSING_INVENTORY" | "MISSING_KEY_OR_ACCESS_DEVICE" | "CLEANING" | "MAINTENANCE" | "OTHER_CONTRACTUAL_CHARGE" | "OTHER", string>;
  assessmentSourceType: Record<"INSPECTION_ITEM" | "INVENTORY_ITEM" | "KEY_ITEM" | "MAINTENANCE_REQUEST" | "OTHER", string>;
  settlementDisputeStatus: Record<"NONE" | "RAISED" | "UNDER_REVIEW" | "RESOLVED", string>;
  settlementRefundStatus: Record<"PENDING" | "APPROVED" | "PAID" | "CANCELLED", string>;
  tenantPortalAccountStatus: Record<"INVITED" | "ACTIVE" | "SUSPENDED" | "DISABLED", string>;
  ownerPortalAccountStatus: Record<"INVITED" | "ACTIVE" | "SUSPENDED" | "DISABLED", string>;
  corporateAccountStatus: Record<"PROSPECT" | "ACTIVE" | "INACTIVE" | "SUSPENDED", string>;
  corporateContactType: Record<"PRIMARY" | "HR" | "ADMINISTRATION" | "FINANCE" | "HOUSING_COORDINATOR" | "EMERGENCY" | "OTHER", string>;
  corporateOccupantStatus: Record<"ACTIVE" | "INACTIVE" | "LEFT_COMPANY", string>;
  corporateHousingAllocationStatus: Record<"PLANNED" | "ACTIVE" | "ENDED" | "CANCELLED", string>;
  communicationChannel: Record<"EMAIL" | "WHATSAPP", string>;
  communicationMessageStatus: Record<"QUEUED" | "PROCESSING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "CANCELLED", string>;
  communicationTemplateStatus: Record<"DRAFT" | "ACTIVE" | "ARCHIVED", string>;
  communicationRecipientStrategy: Record<
    "RENTER" | "OWNER" | "CORPORATE_PRIMARY_CONTACT" | "CORPORATE_HOUSING_CONTACT" | "ASSIGNED_STAFF" | "SPECIFIC_INTERNAL_USER",
    string
  >;
  documentCategoryLabel: Record<
    | "CONTRACT"
    | "IDENTITY"
    | "OWNERSHIP_DEED"
    | "BANK_DETAIL"
    | "MOVE_IN_EVIDENCE"
    | "MOVE_OUT_EVIDENCE"
    | "SECURITY_DEPOSIT_EVIDENCE"
    | "MAINTENANCE_EVIDENCE"
    | "PAYMENT_RECEIPT"
    | "CORPORATE_ACCOUNT_DOCUMENT"
    | "BUILDING_PLAN"
    | "GENERAL"
    | "OTHER",
    string
  >;
  documentStatusLabel: Record<"ACTIVE" | "ARCHIVED", string>;
  documentVisibilityLabel: Record<"INTERNAL_ONLY" | "TENANT_VISIBLE" | "OWNER_VISIBLE", string>;
  documentEntityTypeLabel: Record<
    | "RENTER"
    | "OWNER"
    | "CONTRACT"
    | "UNIT"
    | "COMPOUND"
    | "BUILDING"
    | "INVOICE"
    | "PAYMENT"
    | "MAINTENANCE_REQUEST"
    | "MOVE_IN"
    | "MOVE_OUT"
    | "SECURITY_DEPOSIT_SETTLEMENT"
    | "CORPORATE_ACCOUNT"
    | "CORPORATE_OCCUPANT",
    string
  >;
  documents: {
    navTitle: string;
    listTitle: string;
    listSubtitle: string;
    newButton: string;
    newTitle: string;
    newSubtitle: string;
    detailTitle: string;
    backLabel: string;

    filterCategory: string;
    filterStatus: string;
    filterSearch: string;
    filterAll: string;
    filterApply: string;

    colDocumentNumber: string;
    colTitle: string;
    colCategory: string;
    colStatus: string;
    colVisibility: string;
    colEntity: string;
    colCurrentVersion: string;
    colCreatedAt: string;
    empty: string;
    previous: string;
    next: string;
    pageOf: (page: number, total: number) => string;

    fieldTitle: string;
    fieldCategory: string;
    fieldVisibility: string;
    fieldEntityType: string;
    fieldEntityId: string;
    fieldEntityIdHint: string;
    fieldFile: string;
    fileHint: string;
    createButton: string;

    sectionCurrentVersion: string;
    sectionVersionHistory: string;
    sectionLinks: string;
    sectionAuditTrail: string;
    colVersionNumber: string;
    colFileName: string;
    colFileSize: string;
    colMimeType: string;
    colUploadedAt: string;
    downloadButton: string;
    previewButton: string;
    noCurrentVersion: string;
    uploadNewVersionTitle: string;
    uploadNewVersionButton: string;
    changeVisibilityTitle: string;
    changeVisibilityButton: string;
    archiveButton: string;
    restoreButton: string;
    archivedBadge: string;
    activeBadge: string;
    addLinkTitle: string;
    addLinkButton: string;
    removeLinkButton: string;
    fieldLinkEntityType: string;
    fieldLinkEntityId: string;
    emptyLinks: string;
    emptyAuditTrail: string;
    securityContextLabel: string;

    portalTitle: string;
    portalSubtitle: string;
    portalEmpty: string;
    portalDownloadButton: string;
    portalNoVersion: string;
  };
  moveIn: {
    listTitle: string;
    listSubtitle: string;
    newTitle: string;
    searchPlaceholder: string;
    filterStatus: string;
    filterCompound: string;
    filterInspector: string;
    filterScheduledFrom: string;
    filterScheduledTo: string;
    filterHandoverFrom: string;
    filterHandoverTo: string;
    filterToday: string;
    filterUpcoming: string;
    filterCompleted: string;
    filterOverdue: string;
    filterAll: string;
    filterApply: string;
    colMoveInNumber: string;
    colContract: string;
    colUnit: string;
    colCompound: string;
    colRenter: string;
    colStatus: string;
    colScheduled: string;
    colHandover: string;
    colProgress: string;
    colInspector: string;
    empty: string;
    previous: string;
    next: string;
    pageOf: (page: number, total: number) => string;

    selectContract: string;
    contractSearchPlaceholder: string;
    noEligibleContracts: string;
    scheduledAtLabel: string;
    isFurnishedLabel: string;
    createButton: string;

    sectionOverview: string;
    sectionChecklist: string;
    sectionInventory: string;
    sectionMeters: string;
    sectionKeys: string;
    sectionAttachments: string;
    sectionAcknowledgement: string;
    sectionReadiness: string;
    sectionDefects: string;

    fieldMoveInNumber: string;
    fieldContract: string;
    fieldUnit: string;
    fieldRenter: string;
    fieldCompound: string;
    fieldBuilding: string;
    fieldFloor: string;
    fieldStatus: string;
    fieldScheduledAt: string;
    fieldStartedAt: string;
    fieldHandoverDate: string;
    fieldCompletedAt: string;
    fieldInspector: string;
    fieldHandedOverBy: string;
    fieldOverallCondition: string;
    fieldTenantComments: string;
    fieldInternalNotes: string;
    fieldIsFurnished: string;
    notSet: string;

    scheduleButton: string;
    startButton: string;
    markReadyButton: string;
    completeButton: string;
    cancelButton: string;
    saveButton: string;
    addButton: string;

    progressLabel: (completed: number, total: number, percent: number) => string;

    notesLabel: string;
    requiresAttentionLabel: string;

    inventoryCategoryLabel: string;
    inventoryItemNameLabel: string;
    inventoryQuantityLabel: string;
    inventoryConditionLabel: string;
    inventorySerialNumberLabel: string;
    inventoryBrandLabel: string;
    inventoryModelLabel: string;
    addInventoryButton: string;
    inventoryEmpty: string;

    meterTypeLabel: string;
    meterNumberLabel: string;
    meterReadingLabel: string;
    meterUnitOfMeasureLabel: string;
    addMeterButton: string;
    meterEmpty: string;
    meterRequiredNotice: string;

    keyTypeLabel: string;
    keyDescriptionLabel: string;
    keyQuantityLabel: string;
    keyIdentifierLabel: string;
    keyReturnedExpectedLabel: string;
    addKeyButton: string;
    keyEmpty: string;
    noKeysToRecordLabel: string;

    attachmentEmpty: string;
    attachmentNote: string;

    tenantRepresentativeNameLabel: string;
    tenantRepresentativeIdLabel: string;
    tenantAcknowledgedAtLabel: string;
    recordTenantAcknowledgementButton: string;
    overrideLabel: string;
    overrideReasonLabel: string;
    saveOverrideButton: string;
    staffAcknowledgedAtLabel: string;
    recordStaffAcknowledgementButton: string;
    acknowledgementDisclaimer: string;

    utilitiesReadyLabel: string;
    keysReadyLabel: string;
    cleaningCompleteLabel: string;
    unitReadyLabel: string;
    saveReadinessButton: string;

    defectSummaryTitle: string;
    defectTotalItems: string;
    defectRequiresAttention: string;
    defectDamaged: string;
    defectNotWorking: string;
    defectPoor: string;
    defectNoticeNotBlocking: string;

    cancelTitle: string;
    cancelReasonLabel: string;
    cancelNoteLabel: string;
    confirmCancelButton: string;

    missingRequirementsTitle: string;
    completionReadyNotice: string;

    contractStatusLabel: string;
    createMoveInButton: string;
    viewMoveInButton: string;
    noMoveInYet: string;

    reportTitle: string;
    reportSubtitle: (moveInNumber: string) => string;
    reportOrgLabel: string;
    reportContractLabel: string;
    reportLeaseDatesLabel: string;
    reportChecklistSummary: string;
    reportDefectsSection: string;
    reportNoDefects: string;
    reportAcknowledgementSection: string;
    reportNotLegalSignatureNotice: string;
    reportPrintedOn: string;

    activityCompleted: (moveInNumber: string) => string;
  };
  moveOut: {
    listTitle: string;
    listSubtitle: string;
    newTitle: string;
    searchPlaceholder: string;
    filterStatus: string;
    filterCompound: string;
    filterContract: string;
    filterInspector: string;
    filterScheduledFrom: string;
    filterScheduledTo: string;
    filterVacateFrom: string;
    filterVacateTo: string;
    filterHasFindings: string;
    filterHasMaintenance: string;
    filterCompletedOnly: string;
    filterCancelledOnly: string;
    filterOverdueOnly: string;
    filterAll: string;
    filterApply: string;
    colMoveOutNumber: string;
    colUnit: string;
    colRenter: string;
    colContract: string;
    colCompound: string;
    colScheduled: string;
    colVacate: string;
    colStatus: string;
    colProgress: string;
    colFindings: string;
    empty: string;
    previous: string;
    next: string;
    pageOf: (page: number, total: number) => string;

    selectContract: string;
    contractSearchPlaceholder: string;
    noEligibleContracts: string;
    scheduledAtLabel: string;
    createButton: string;

    sectionSummary: string;
    sectionMoveInBaseline: string;
    sectionChecklist: string;
    sectionInventory: string;
    sectionMeters: string;
    sectionKeys: string;
    sectionFindingsSummary: string;
    sectionMaintenanceRequests: string;
    sectionAttachments: string;
    sectionAcknowledgement: string;
    sectionFindingsReview: string;
    sectionReadiness: string;
    sectionCompletionPreview: string;

    fieldMoveOutNumber: string;
    fieldContract: string;
    fieldUnit: string;
    fieldRenter: string;
    fieldCompound: string;
    fieldInspector: string;
    fieldHandedOverBy: string;
    fieldScheduledAt: string;
    fieldStartedAt: string;
    fieldVacateDate: string;
    fieldCompletedAt: string;
    fieldFindingsReviewedAt: string;
    fieldFindingsReviewedBy: string;
    fieldTenantComments: string;
    notSet: string;

    startButton: string;
    advanceToFindingsReviewButton: string;
    reviewFindingsButton: string;
    reopenButton: string;
    completeButton: string;
    cancelButton: string;
    saveButton: string;
    addButton: string;

    progressLabel: (completed: number, total: number, percent: number) => string;

    notesLabel: string;
    requiresAttentionLabel: string;

    noMoveInBaseline: string;
    moveInConditionLabel: string;
    moveOutConditionLabel: string;
    conditionChangeLabel: string;

    inventoryCategoryLabel: string;
    inventoryItemNameLabel: string;
    inventoryMoveInQtyLabel: string;
    inventoryMoveOutQtyLabel: string;
    inventoryQuantityLabel: string;
    inventoryConditionLabel: string;
    inventoryBrandLabel: string;
    addInventoryButton: string;
    inventoryEmpty: string;

    meterTypeLabel: string;
    meterNumberLabel: string;
    meterMoveInReadingLabel: string;
    meterMoveOutReadingLabel: string;
    meterReadingLabel: string;
    meterDifferenceLabel: string;
    meterUnitOfMeasureLabel: string;
    addMeterButton: string;
    meterEmpty: string;
    meterRequiredNotice: string;

    keyTypeLabel: string;
    keyDescriptionLabel: string;
    keyQuantityLabel: string;
    keyIssuedLabel: string;
    keyReturnedLabel: string;
    keyDifferenceLabel: string;
    keyFullyReturnedLabel: string;
    addKeyButton: string;
    keyEmpty: string;
    noKeysToReturnLabel: string;

    attachmentEmpty: string;
    attachmentNote: string;

    findingsTotalItems: string;
    findingsDeteriorated: string;
    findingsDamaged: string;
    findingsNotWorking: string;
    findingsPoor: string;
    findingsRequiresAttention: string;
    findingsMaintenanceCreated: string;
    findingsNoticeNotLiability: string;

    createMaintenanceRequestButton: string;
    maintenanceEmpty: string;
    maintenanceColRequestNumber: string;
    maintenanceColStatus: string;
    maintenanceColPriority: string;
    maintenanceColCategory: string;
    maintenanceColCreatedAt: string;

    tenantRepresentativeNameLabel: string;
    tenantRepresentativeIdLabel: string;
    tenantAcknowledgedAtLabel: string;
    recordTenantAcknowledgementButton: string;
    overrideLabel: string;
    overrideReasonLabel: string;
    saveOverrideButton: string;
    staffAcknowledgedAtLabel: string;
    recordStaffAcknowledgementButton: string;
    acknowledgementDisclaimer: string;

    cancelTitle: string;
    cancelReasonLabel: string;
    cancelNoteLabel: string;
    confirmCancelButton: string;

    missingRequirementsTitle: string;

    readinessChecklistTitle: string;
    readinessInspectionComplete: string;
    readinessFindingsReviewed: string;
    readinessMetersRecorded: string;
    readinessKeysRecorded: string;
    readinessVacateDateRecorded: string;
    readinessAcknowledgementsComplete: string;

    completionPreviewTitle: string;
    completionPreviewBody: string;
    completionPreviewNotDeposit: string;
    completionConfirmButton: string;

    vacancyConflictNotice: string;
    completedReadOnlyNotice: string;

    contractStatusLabel: string;
    createMoveOutButton: string;
    viewMoveOutButton: string;
    noMoveOutYet: string;

    reportTitle: string;
    reportSubtitle: (moveOutNumber: string) => string;
    reportOrgLabel: string;
    reportContractLabel: string;
    reportLeaseDatesLabel: string;
    reportInspectionDateLabel: string;
    reportConditionComparisonSection: string;
    reportFindingsSummarySection: string;
    reportNoFindings: string;
    reportMaintenanceSection: string;
    reportDisclaimer: string;
    reportAcknowledgementSection: string;
    reportNotLegalSignatureNotice: string;
    reportPrintedOn: string;
    reportDurationDaysLabel: string;
  };
  operations: {
    dashboardTitle: string;
    dashboardSubtitle: string;
    kpiToday: string;
    kpiUpcoming: string;
    kpiInProgress: string;
    kpiReadyForHandover: string;
    kpiCompletedThisMonth: string;
    kpiUnitsWithDefects: string;
    kpiOverdue: string;
    goToMoveIns: string;

    reportsTitle: string;
    reportsSubtitle: string;
    reportSchedule: string;
    reportCompletion: string;
    reportUnitCondition: string;
    reportHandoverDefects: string;
    reportMeterReading: string;
    reportKeysHandover: string;
    reportFurnishedInventory: string;

    kpiOpenRequests: string;
    kpiEmergencyRequests: string;
    kpiSlaBreached: string;
    kpiWorkOrdersInProgress: string;
    kpiWorkOrdersOnHold: string;
    kpiCompletedAwaitingVerification: string;
    kpiClosedThisMonth: string;
    kpiMaintenanceCostThisMonth: string;

    moveOutSectionTitle: string;
    goToMoveOuts: string;
    kpiMoveOutsToday: string;
    kpiMoveOutsUpcoming: string;
    kpiMoveOutsInProgress: string;
    kpiMoveOutsPendingFindingsReview: string;
    kpiMoveOutsReadyForClosure: string;
    kpiMoveOutsCompletedThisMonth: string;
    kpiMoveOutsOverdue: string;
    kpiMoveOutsWithFindings: string;
    kpiMoveOutsWithMaintenance: string;

    reportMoveOutSchedule: string;
    reportMoveOutCompletion: string;
    reportMoveOutUnitCondition: string;
    reportMoveOutFindings: string;
    reportInventoryVariance: string;
    reportMoveOutMeterReading: string;
    reportMoveOutKeysAccess: string;
    reportMoveOutMaintenanceFindings: string;
    reportsMoveOutSubtitle: string;
  };
  maintenance: {
    slaResponseDue: string;
    slaResolutionDue: string;
    slaLabel: string;

    // Requests list/new/detail
    requestsListTitle: string;
    requestsListSubtitle: string;
    newRequestTitle: string;
    requestSearchPlaceholder: string;
    filterStatus: string;
    filterPriority: string;
    filterCategory: string;
    filterScope: string;
    filterCompound: string;
    filterBuilding: string;
    filterUnit: string;
    filterAssigned: string;
    filterVendor: string;
    filterSlaBreached: string;
    filterOpenOnly: string;
    filterEmergencyOnly: string;
    filterAll: string;
    filterApply: string;
    colRequestNumber: string;
    colTitle: string;
    colLocation: string;
    colCategory: string;
    colPriority: string;
    colStatus: string;
    colReportedAt: string;
    colSla: string;
    colAssigned: string;
    colWorkOrder: string;
    colActions: string;
    empty: string;
    previous: string;
    next: string;
    pageOf: (page: number, total: number) => string;

    fieldScopeType: string;
    fieldCompound: string;
    fieldBuilding: string;
    fieldFloor: string;
    fieldUnit: string;
    fieldContract: string;
    fieldRenter: string;
    fieldCategory: string;
    fieldPriority: string;
    fieldTitle: string;
    fieldDescription: string;
    fieldReportedByType: string;
    fieldReportedByName: string;
    fieldReportedByPhone: string;
    fieldPreferredVisitDate: string;
    fieldPreferredTimeWindow: string;
    fieldPermissionToEnter: string;
    fieldSource: string;
    notSet: string;
    createButton: string;
    saveButton: string;
    viewButton: string;
    cancelButton: string;

    sectionSummary: string;
    sectionLocation: string;
    sectionTenant: string;
    sectionReportedBy: string;
    sectionSla: string;
    sectionDescription: string;
    sectionAttachments: string;
    sectionMoveInSource: string;
    sectionMoveOutSource: string;
    sectionTriage: string;
    sectionWorkOrder: string;
    sectionActivity: string;
    sectionAudit: string;

    triageButton: string;
    triageNotesLabel: string;
    triagedAtLabel: string;
    triagedByLabel: string;
    createWorkOrderButton: string;
    noWorkOrderYet: string;
    cancelRequestTitle: string;
    cancelReasonLabel: string;
    cancelNoteLabel: string;
    confirmCancelButton: string;
    moveInSourceLabel: string;
    moveOutSourceLabel: string;

    // Work Orders list/detail
    workOrdersListTitle: string;
    workOrdersListSubtitle: string;
    colWorkOrderNumber: string;
    colRequest: string;
    colResponsibleParty: string;
    colScheduled: string;
    colStarted: string;
    colActualCost: string;

    fieldAssignedUser: string;
    fieldVendor: string;
    fieldScheduledStart: string;
    fieldScheduledEnd: string;
    fieldDiagnosis: string;
    fieldWorkPerformed: string;
    fieldCompletionNotes: string;
    fieldRequiresFollowUp: string;
    fieldEstimatedCost: string;
    fieldActualCost: string;
    fieldCostResponsibility: string;
    fieldHoldReason: string;
    fieldHoldNote: string;
    fieldVerificationNotes: string;

    sectionAssignment: string;
    sectionSchedule: string;
    sectionDiagnosis: string;
    sectionWorkLogs: string;
    sectionLabor: string;
    sectionParts: string;
    sectionOtherCosts: string;
    sectionCostSummary: string;
    sectionCompletion: string;
    sectionVerification: string;

    assignButton: string;
    scheduleButton: string;
    startButton: string;
    holdButton: string;
    resumeButton: string;
    diagnoseButton: string;
    completeButton: string;
    verifyButton: string;
    closeButton: string;
    cancelWorkOrderTitle: string;

    addWorkLogButton: string;
    workLogNoteLabel: string;
    workLogTypeLabel: string;
    workLogEmpty: string;

    addLaborButton: string;
    laborDescriptionLabel: string;
    laborHoursLabel: string;
    laborRateLabel: string;
    laborCostLabel: string;
    laborEmpty: string;

    addPartButton: string;
    partItemNameLabel: string;
    partQuantityLabel: string;
    partUnitCostLabel: string;
    partTotalCostLabel: string;
    partSupplierLabel: string;
    partEmpty: string;

    addCostButton: string;
    costTypeLabel: string;
    costDescriptionLabel: string;
    costAmountLabel: string;
    costEmpty: string;

    costLaborTotal: string;
    costPartsTotal: string;
    costOtherTotal: string;
    costActualTotal: string;
    costEstimatedLabel: string;
    costVarianceLabel: string;
    costOperationalNotice: string;

    // Vendors
    vendorsListTitle: string;
    vendorsListSubtitle: string;
    newVendorTitle: string;
    colVendorNumber: string;
    colVendorName: string;
    colSpecialties: string;
    colActive: string;
    fieldVendorName: string;
    fieldVendorNameAr: string;
    fieldContactPerson: string;
    fieldPhone: string;
    fieldEmail: string;
    fieldSpecialties: string;
    fieldNotes: string;
    activateButton: string;
    deactivateButton: string;
    activeLabel: string;
    inactiveLabel: string;

    // Print report
    reportTitle: string;
    reportSubtitle: (workOrderNumber: string) => string;
    reportOrgLabel: string;
    reportPrintedOn: string;

    // Reports index
    reportsTitle: string;
    reportsSubtitle: string;
    reportRequestSummary: string;
    reportWorkOrderStatus: string;
    reportSlaPerformance: string;
    reportByCategory: string;
    reportByCompound: string;
    reportByUnit: string;
    reportCost: string;
    reportVendorPerformance: string;
    reportTechnicianPerformance: string;
    reportRecurringIssue: string;
    averageResponseTimeLabel: string;
    averageResolutionTimeLabel: string;
    minutesUnit: (n: number) => string;
    hoursUnit: (n: number) => string;
    colAssignedCount: string;
    colCompletedCount: string;
    colClosedCount: string;
    colVerifiedCount: string;
    recurringIssueWindowLabel: (days: number) => string;
  };
  securityDeposit: {
    listTitle: string;
    listSubtitle: string;
    empty: string;
    notSet: string;
    saveButton: string;
    addButton: string;

    filterSearch: string;
    filterStatus: string;
    filterAll: string;
    filterApply: string;
    filterDisputedOnly: string;
    previous: string;
    next: string;
    pageOf: (page: number, totalPages: number) => string;

    colSettlementNumber: string;
    colContract: string;
    colUnit: string;
    colTenant: string;
    colMoveOut: string;
    colStatus: string;
    colCreatedAt: string;

    createSettlementButton: string;
    viewSettlementButton: string;
    noSettlementYet: string;

    sectionSummary: string;
    sectionDepositPosition: string;
    sectionFindings: string;
    sectionAssessments: string;
    sectionCalculationSummary: string;
    sectionApproval: string;
    sectionPosting: string;
    sectionRefund: string;
    sectionAdditionalDue: string;
    sectionFinancialReferences: string;
    sectionNotes: string;

    fieldSettlementNumber: string;
    fieldContract: string;
    fieldUnit: string;
    fieldRenter: string;
    fieldMoveOut: string;
    fieldStatus: string;
    fieldPreparedBy: string;
    fieldReviewedBy: string;
    fieldApprovedBy: string;
    fieldPostedBy: string;

    depositRequiredLabel: string;
    depositCollectedLabel: string;
    depositAvailableLabel: string;
    depositOverCollectedNotice: string;

    findingNotLiabilityNotice: string;
    addAssessmentFromFindingButton: string;
    addManualAssessmentButton: string;

    colCategory: string;
    colDescription: string;
    colEvidence: string;
    colResponsibility: string;
    colProposed: string;
    colApproved: string;
    colWaived: string;
    colDispute: string;

    responsibilityLabel: string;
    categoryLabel: string;
    descriptionLabel: string;
    proposedAmountLabel: string;
    approvedAmountLabel: string;
    waivedAmountLabel: string;
    waiverReasonLabel: string;
    disputeStatusLabel: string;
    disputeNoteLabel: string;
    assessmentReasonLabel: string;

    totalProposedTenantLabel: string;
    totalApprovedTenantLabel: string;
    totalWaivedTenantLabel: string;

    outcomeDepositAppliedLabel: string;
    outcomeRefundDueLabel: string;
    outcomeAdditionalDueLabel: string;

    submitForReviewButton: string;
    reviewForwardButton: string;
    reviewBackButton: string;
    approveButton: string;
    reopenForCorrectionButton: string;
    postButton: string;
    cancelButton: string;
    confirmCancelButton: string;
    cancelReasonLabel: string;

    approvalBlockedUndeterminedNotice: string;
    approvalBlockedDisputeNotice: string;

    approvalPreviewTitle: string;
    approvalPreviewBody: string;
    postingPreviewTitle: string;
    postingPreviewBody: string;

    refundDueLabel: string;
    refundPaidLabel: string;
    refundRemainingLabel: string;
    refundAmountLabel: string;
    refundMethodLabel: string;
    refundReferenceLabel: string;
    refundNotesLabel: string;
    recordRefundButton: string;
    refundHistoryEmpty: string;
    colLastRefundDate: string;

    additionalDueEmpty: string;
    financialReferencesEmpty: string;

    addNoteButton: string;
    noteLabel: string;
    notesEmpty: string;

    reportTitle: string;
    reportSubtitle: (settlementNumber: string) => string;
    reportOrgLabel: string;
    reportDisclaimer: string;
    reportPrintedOn: string;
    reportNotFinalWhileDisputed: string;

    reportsTitle: string;
    reportsSubtitle: string;
    reportSettlement: string;
    reportDepositBalance: string;
    reportRefund: string;
    reportDeductions: string;
    reportOutstandingAdditional: string;
    reportDisputed: string;

    kpiPendingReview: string;
    kpiPendingApproval: string;
    kpiApprovedNotPosted: string;
    kpiRefundsDue: string;
    kpiRefundAmountOutstanding: string;
    kpiAdditionalTenantAmountDue: string;
    kpiDisputedSettlements: string;
    sectionTitle: string;
    goToSettlements: string;
  };
  tenantPortal: {
    // Errors / validation (thrown from server actions, bilingual per this
    // codebase's established convention)
    notFoundTitle: string;
    notFoundMessage: string;
    notFoundBackLink: string;
    accountAlreadyExists: string;
    emailAlreadyInUse: string;
    renterNotFound: string;
    accountNotFound: string;
    invalidAccountTransition: string;
    currentPasswordIncorrect: string;
    noActiveTenancy: string;
    maintenanceNotCancellable: string;

    // Brand / shell
    portalTitle: string;
    signOut: string;

    // Nav
    navDashboard: string;
    navContract: string;
    navPayments: string;
    navInvoices: string;
    navMoveIn: string;
    navMaintenance: string;
    navMoveOut: string;
    navSecurityDeposit: string;
    navDocuments: string;
    navProfile: string;

    // Login
    loginTitle: string;
    loginSubtitle: string;
    loginEmail: string;
    loginPassword: string;
    loginSubmit: string;
    loginError: string;

    // Dashboard
    dashboardTitle: string;
    dashboardSubtitle: string;
    cardCurrentContract: string;
    cardUnit: string;
    cardNextPaymentDue: string;
    cardOutstandingBalance: string;
    cardOpenMaintenance: string;
    cardMoveInStatus: string;
    cardMoveOutStatus: string;
    cardDepositPosition: string;
    cardRecentReceipts: string;
    noCurrentTenancy: string;
    noUpcomingPayment: string;

    // Contracts
    contractsTitle: string;
    currentTenancyTitle: string;
    pastContractsTitle: string;
    noPastContracts: string;
    fieldContractNumber: string;
    fieldUnit: string;
    fieldStartDate: string;
    fieldEndDate: string;
    fieldRent: string;
    fieldPaymentFrequency: string;
    fieldSecurityDepositRequired: string;
    fieldStatus: string;
    renewedInto: string;
    contractDocumentNotice: string;

    // Payment schedule / invoices / receipts
    paymentScheduleTitle: string;
    colInstallment: string;
    colPeriod: string;
    colDueDate: string;
    colAmount: string;
    colStatus: string;
    invoicesTitle: string;
    colInvoiceNumber: string;
    colIssueDate: string;
    colTotal: string;
    colPaid: string;
    colBalance: string;
    viewInvoiceButton: string;
    invoiceDetailTitle: string;
    invoiceLinesTitle: string;
    colSubtotal: string;
    colVat: string;
    receiptsTitle: string;
    colReceiptNumber: string;
    colPaymentDate: string;
    colMethod: string;
    reversedNotice: string;
    outstandingBalanceLabel: string;
    emptyInvoices: string;
    emptyPayments: string;

    // Move-In
    moveInTitle: string;
    noMoveInYet: string;
    moveInAcknowledgedLabel: string;

    // Maintenance
    maintenanceTitle: string;
    maintenanceSubtitle: string;
    newMaintenanceRequestButton: string;
    newMaintenanceRequestTitle: string;
    fieldCategory: string;
    fieldPriority: string;
    fieldTitle: string;
    fieldDescription: string;
    fieldPreferredVisitDate: string;
    fieldPreferredTimeWindow: string;
    fieldPermissionToEnter: string;
    submitRequestButton: string;
    emergencyWarning: string;
    colRequestNumber: string;
    colReported: string;
    cancelRequestButton: string;
    confirmCancelMaintenanceButton: string;
    emptyMaintenance: string;
    maintenanceDetailTitle: string;
    scheduledVisitLabel: string;
    workStatusLabel: string;

    // Move-Out
    moveOutTitle: string;
    noMoveOutYet: string;
    findingsNoticeTenant: string;

    // Security Deposit
    securityDepositTitle: string;
    depositRequiredLabel: string;
    depositAvailableLabel: string;
    noSettlementYet: string;
    settlementApprovedPendingPostingNotice: string;
    assessedDeductionsTitle: string;
    colDeductionCategory: string;
    colDeductionDescription: string;
    colDeductionAmount: string;
    colWaivedAmount: string;
    depositAppliedLabel: string;
    refundDueLabel: string;
    refundPaidLabel: string;
    refundRemainingLabel: string;
    additionalAmountDueLabel: string;
    additionalAmountDueInvoiceLabel: string;
    printStatementButton: string;

    // Profile
    profileTitle: string;
    fieldFullName: string;
    fieldEmail: string;
    fieldPhone: string;
    fieldCompany: string;
    contactPhoneLabel: string;
    saveButton: string;
    changePasswordTitle: string;
    fieldCurrentPassword: string;
    fieldNewPassword: string;
    changePasswordButton: string;
    mustChangePasswordNotice: string;

    // Internal admin integration (Contract/Renter page)
    sectionPortalAccess: string;
    noPortalAccountNotice: string;
    accountStatusLabel: string;
    lastLoginLabel: string;
    neverLoggedInValue: string;
    createAccountButton: string;
    activateAccountButton: string;
    suspendAccountButton: string;
    disableAccountButton: string;
    resetPasswordButton: string;
    temporaryPasswordNotice: string;
    temporaryPasswordLabel: string;
    copyOncePasswordWarning: string;
    closeButton: string;
  };
  ownerPortal: {
    // Errors / validation
    notFoundTitle: string;
    notFoundMessage: string;
    notFoundBackLink: string;
    accountAlreadyExists: string;
    emailAlreadyInUse: string;
    ownerNotFound: string;
    accountNotFound: string;
    invalidAccountTransition: string;
    currentPasswordIncorrect: string;
    loginError: string;

    // Brand / shell
    portalTitle: string;
    signOut: string;

    // Nav
    navDashboard: string;
    navProperties: string;
    navUnits: string;
    navContracts: string;
    navFinancials: string;
    navLedger: string;
    navStatements: string;
    navMaintenance: string;
    navDocuments: string;
    navProfile: string;

    // Login
    loginTitle: string;
    loginSubtitle: string;
    loginEmail: string;
    loginPassword: string;
    loginSubmit: string;

    // Dashboard
    dashboardTitle: string;
    dashboardSubtitle: string;
    cardProperties: string;
    cardUnits: string;
    cardOccupied: string;
    cardVacant: string;
    cardOccupancyRate: string;
    cardActiveContracts: string;
    cardMonthlyIncome: string;
    cardMonthlyExpenses: string;
    cardNetPosition: string;
    cardOutstandingBalance: string;
    cardOpenMaintenance: string;

    // Portfolio / Properties
    propertiesTitle: string;
    propertiesSubtitle: string;
    colCompound: string;
    colBuilding: string;
    colUnits: string;
    colOwnershipPercentage: string;
    ownershipPercentageNotice: string;
    emptyProperties: string;
    propertyDetailTitle: string;

    // Units
    unitsTitle: string;
    colUnit: string;
    colFloor: string;
    colOccupancyStatus: string;
    unitDetailTitle: string;
    fieldOwnershipPercentage: string;
    fieldEffectiveOwnership: string;
    moveInStatusLabel: string;
    moveOutStatusLabel: string;
    emptyUnits: string;

    // Contracts
    contractsTitle: string;
    colContractNumber: string;
    colTenant: string;
    colStartDate: string;
    colEndDate: string;
    colRent: string;
    colPaymentFrequency: string;
    colStatus: string;
    contractDetailTitle: string;
    emptyContracts: string;

    // Financial Summary
    financialsTitle: string;
    financialsSubtitle: string;
    cardCurrentBalance: string;
    cardMonthToDateIncome: string;
    cardMonthToDateExpenses: string;
    cardYearToDateIncome: string;
    cardYearToDateExpenses: string;
    cardNetMovement: string;
    recentLedgerEntriesTitle: string;

    // Ledger
    ledgerTitle: string;
    ledgerSubtitle: string;
    colDate: string;
    colType: string;
    colDescription: string;
    colProperty: string;
    colDebit: string;
    colCredit: string;
    colRunningBalance: string;
    emptyLedger: string;

    // Statement
    statementTitle: string;
    statementFrom: string;
    statementTo: string;
    statementGenerateButton: string;
    openingBalanceLabel: string;
    closingBalanceLabel: string;
    totalIncomeLabel: string;
    totalExpensesLabel: string;
    totalDistributionsLabel: string;
    netMovementLabel: string;
    printStatementButton: string;

    // Maintenance
    maintenanceTitle: string;
    maintenanceSubtitle: string;
    colRequestNumber: string;
    colCategory: string;
    colPriority: string;
    colReportedDate: string;
    maintenanceDetailTitle: string;
    workOrderStatusLabel: string;
    completionDateLabel: string;
    costResponsibilityLabel: string;
    operationalMaintenanceCostLabel: string;
    operationalMaintenanceCostNotice: string;
    ownerExpenseLabel: string;
    ownerExpenseNotice: string;
    emptyMaintenance: string;

    // Profile
    profileTitle: string;
    fieldFullName: string;
    fieldEmail: string;
    fieldPhone: string;
    saveButton: string;
    changePasswordTitle: string;
    fieldCurrentPassword: string;
    fieldNewPassword: string;
    changePasswordButton: string;
    mustChangePasswordNotice: string;

    // Internal admin integration (Owner profile page)
    sectionPortalAccess: string;
    noPortalAccountNotice: string;
    accountStatusLabel: string;
    lastLoginLabel: string;
    neverLoggedInValue: string;
    createAccountButton: string;
    activateAccountButton: string;
    suspendAccountButton: string;
    disableAccountButton: string;
    resetPasswordButton: string;
    temporaryPasswordNotice: string;
    temporaryPasswordLabel: string;
    copyOncePasswordWarning: string;
    closeButton: string;
  };
  corporateHousing: {
    // Generic list/filter controls
    searchLabel: string;
    filterAll: string;
    filterApply: string;
    previousLabel: string;
    nextLabel: string;

    // Errors / validation
    renterNotFound: string;
    renterNotCorporate: string;
    accountAlreadyExists: string;
    accountNotFound: string;
    contactNotFound: string;
    occupantNotFound: string;
    contractNotFound: string;
    contractNotEligible: string;
    allocationDatesInvalid: string;
    occupantOverlap: string;
    allocationNotFound: string;
    allocationInvalidTransition: string;
    allocationUnsafe: string;

    // Nav / shell
    navDashboard: string;
    navAccounts: string;
    navOccupants: string;
    navAllocations: string;
    navReports: string;

    // Dashboard
    dashboardTitle: string;
    dashboardSubtitle: string;
    cardActiveAccounts: string;
    cardCorporateContracts: string;
    cardCorporateLeasedUnits: string;
    cardActiveOccupants: string;
    cardActiveAllocations: string;
    cardPlannedArrivals: string;
    cardPlannedDepartures: string;
    cardUnallocatedUnits: string;
    cardAllocationRate: string;
    cardOpenMaintenance: string;
    cardContractsExpiringSoon: string;

    // Accounts list/profile
    accountsTitle: string;
    accountsSubtitle: string;
    newAccountButton: string;
    createAccountTitle: string;
    colAccountNumber: string;
    colDisplayName: string;
    colStatus: string;
    colAccountManager: string;
    colActiveContracts: string;
    colActiveAllocations: string;
    emptyAccounts: string;
    accountProfileTitle: string;
    sectionAccountSummary: string;
    sectionCorporateRenter: string;
    sectionContacts: string;
    sectionContracts: string;
    sectionUnits: string;
    sectionOccupants: string;
    sectionActiveAllocations: string;
    sectionUpcomingAllocations: string;
    sectionAllocationHistory: string;
    sectionFinancialSnapshot: string;
    sectionMaintenanceSnapshot: string;
    sectionAudit: string;
    fieldDisplayName: string;
    fieldStatus: string;
    fieldIndustry: string;
    fieldWebsite: string;
    fieldAccountManager: string;
    fieldNotes: string;
    fieldCorporateRenter: string;
    saveButton: string;

    // Contacts
    addContactButton: string;
    editContactButton: string;
    fieldContactName: string;
    fieldJobTitle: string;
    fieldDepartment: string;
    fieldEmail: string;
    fieldPhone: string;
    fieldContactType: string;
    fieldIsPrimary: string;
    activateContactButton: string;
    deactivateContactButton: string;
    emptyContacts: string;

    // Occupants
    occupantsTitle: string;
    occupantsSubtitle: string;
    newOccupantButton: string;
    colEmployeeNumber: string;
    colOccupantName: string;
    colCorporateAccount: string;
    colCurrentHousing: string;
    emptyOccupants: string;
    occupantProfileTitle: string;
    sectionEmployeeSummary: string;
    sectionContactDetails: string;
    sectionCurrentAllocation: string;
    sectionMaintenanceReported: string;
    fieldFullName: string;
    fieldFullNameAr: string;
    fieldNationality: string;
    fieldEmergencyContactName: string;
    fieldEmergencyContactPhone: string;
    noCurrentAllocation: string;

    // Allocations
    allocationsTitle: string;
    allocationsSubtitle: string;
    newAllocationButton: string;
    colAllocationNumber: string;
    colOccupant: string;
    colContract: string;
    colUnit: string;
    colStartDate: string;
    colPlannedEndDate: string;
    colActualEndDate: string;
    emptyAllocations: string;
    allocationWorkspaceTitle: string;
    sectionAllocationSummary: string;
    sectionMoveInContext: string;
    sectionMaintenanceContext: string;
    fieldCorporateAccount: string;
    fieldOccupant: string;
    fieldContract: string;
    fieldStartDate: string;
    fieldPlannedEndDate: string;
    fieldBedroomNumber: string;
    fieldRoomLabel: string;
    createAllocationButton: string;
    activateAllocationButton: string;
    endAllocationButton: string;
    cancelAllocationButton: string;
    transferOccupantButton: string;
    confirmEndAllocationButton: string;
    confirmCancelAllocationButton: string;
    transferPageTitle: string;
    fieldNewContract: string;
    fieldNewStartDate: string;
    fieldNewPlannedEndDate: string;
    submitTransferButton: string;

    // Reports
    reportsTitle: string;
    reportAccountSummary: string;
    reportOccupancy: string;
    reportOccupantAllocation: string;
    reportPlannedArrivals: string;
    reportPlannedDepartures: string;
    reportContractExpiry: string;
    reportUnallocatedUnits: string;
    reportMaintenance: string;
    reportFinancialSnapshot: string;
    colContractValue: string;
    colInvoiced: string;
    colPaid: string;
    colOutstanding: string;
    colOverdue: string;
    colCorporateContractCount: string;
    colCorporateUnitCount: string;
    colUnitsWithAllocation: string;
    colUnallocatedUnitCount: string;
    colAllocationRate: string;

    // Printable roster
    rosterTitle: string;
    printRosterButton: string;

    // Maintenance integration
    reportedByCorporateOccupantLabel: string;

    // Integration cards on existing Contract/Unit/Renter/Maintenance pages
    contractIntegrationTitle: string;
    unitIntegrationTitle: string;
    renterIntegrationTitle: string;
    viewCorporateAccountButton: string;
    currentAllocationLabel: string;
    maintenanceTraceabilityTitle: string;
  };
  communications: {
    // Nav
    navDashboard: string;
    navMessages: string;
    navTemplates: string;
    navRules: string;

    // Generic controls
    searchLabel: string;
    filterAll: string;
    filterApply: string;
    saveButton: string;
    cancelButton: string;
    backLabel: string;

    // Errors / validation
    templateNotFound: string;
    ruleNotFound: string;
    messageNotFound: string;
    ruleAlreadyExists: string;
    cannotCancelNotQueued: string;
    cannotRetryNotFailed: string;

    // Dashboard
    dashboardTitle: string;
    dashboardSubtitle: string;
    cardQueued: string;
    cardProcessing: string;
    cardSent: string;
    cardDelivered: string;
    cardFailed: string;
    cardCancelled: string;
    sectionRecentMessages: string;

    // Messages list/detail
    messagesTitle: string;
    messagesSubtitle: string;
    colEvent: string;
    colChannel: string;
    colRecipient: string;
    colDestination: string;
    colStatus: string;
    colCreatedAt: string;
    colAttempts: string;
    emptyMessages: string;
    actionRetry: string;
    actionCancel: string;
    messageDetailTitle: string;
    sectionMessageInfo: string;
    sectionRenderedContent: string;
    sectionDeliveryHistory: string;
    fieldDestination: string;
    fieldTemplate: string;
    fieldTemplateVersion: string;
    fieldBusinessEntity: string;
    fieldAttemptCount: string;
    fieldMaxAttempts: string;
    fieldLastError: string;
    fieldSubject: string;
    fieldLanguage: string;
    colAttemptNumber: string;
    colAttemptStatus: string;
    colProvider: string;
    colStartedAt: string;
    colFinishedAt: string;
    colError: string;
    emptyDeliveryAttempts: string;

    // Templates
    templatesTitle: string;
    templatesSubtitle: string;
    newTemplateButton: string;
    createTemplateTitle: string;
    colTemplateEvent: string;
    colTemplateChannel: string;
    colTemplateLanguage: string;
    colTemplateVersion: string;
    colTemplateStatus: string;
    fieldEventType: string;
    fieldChannel: string;
    fieldTemplateLanguage: string;
    fieldBodyText: string;
    fieldBodyHtml: string;
    fieldNotes: string;
    fieldAllowedVariables: string;
    actionActivate: string;
    actionArchive: string;
    emptyTemplates: string;
    templateDetailTitle: string;
    sectionVersionHistory: string;
    newVersionButton: string;

    // Rules
    rulesTitle: string;
    rulesSubtitle: string;
    newRuleButton: string;
    createRuleTitle: string;
    colRuleEvent: string;
    colRuleChannel: string;
    colRuleStrategy: string;
    colRuleEnabled: string;
    fieldRecipientStrategy: string;
    fieldSpecificUser: string;
    emptyRules: string;
    actionEnable: string;
    actionDisable: string;

    // Manual test-send (restricted)
    testSendTitle: string;
    testSendSubtitle: string;
    testSendButton: string;
    testSendSuccess: string;
    testSendFailure: string;
    fieldTestDestination: string;
  };
}

export type { Locale } from "./config";
