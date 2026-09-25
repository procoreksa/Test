import Link from "next/link";
import { listRenters, createRenter, deleteRenter } from "@/lib/actions/renters";
import { getContractLinksForRenters } from "@/lib/actions/contracts";
import { getMoveInStatusForRenters } from "@/lib/actions/move-ins";
import { getMoveOutStatusForRenters } from "@/lib/actions/move-outs";
import { getCorporateAccountLinksForRenters } from "@/lib/actions/corporate-accounts";
import { getCurrentUserRole } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary, pickLocalized } from "@/lib/i18n";
import { DeleteEntityButton } from "@/components/delete-entity-button";

export default async function RentersPage() {
  const [renters, locale, role] = await Promise.all([listRenters(), getLocale(), getCurrentUserRole()]);
  const t = getDictionary(locale);
  const canCreate = can("renter.create", role);
  const canDelete = can("renter.delete", role);
  const canViewMoveIns = can("moveIn.view", role);
  const canViewMoveOuts = can("moveOut.view", role);
  const canViewCorporateHousing = can("corporateHousing.view", role);
  const canViewTenantPortalAccount = can("tenantPortalAccount.view", role);
  const contractByRenter: Awaited<ReturnType<typeof getContractLinksForRenters>> = canViewTenantPortalAccount
    ? await getContractLinksForRenters(renters.map((r) => r.id))
    : new Map();
  const moveInByRenter: Awaited<ReturnType<typeof getMoveInStatusForRenters>> = canViewMoveIns ? await getMoveInStatusForRenters(renters.map((r) => r.id)) : new Map();
  const moveOutByRenter: Awaited<ReturnType<typeof getMoveOutStatusForRenters>> = canViewMoveOuts ? await getMoveOutStatusForRenters(renters.map((r) => r.id)) : new Map();
  const corporateAccountByRenter: Awaited<ReturnType<typeof getCorporateAccountLinksForRenters>> = canViewCorporateHousing
    ? await getCorporateAccountLinksForRenters(renters.map((r) => r.id))
    : new Map();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.renters.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.renters.subtitle}</p>
      </div>

      {canCreate && (
        <details className="bg-white rounded-xl border border-slate-200 shadow-sm group">
          <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-slate-800 flex items-center justify-between">
            {t.renters.addNew}
            <span className="text-brand-gold-dark group-open:rotate-45 transition-transform text-xl">+</span>
          </summary>
          <form action={createRenter} className="px-5 pb-5 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label={t.renters.fieldFullName} name="fullName" required />
            <Field label={t.renters.fieldFullNameAr} name="fullNameAr" />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t.renters.fieldIdType}</label>
              <select name="idType" className="w-full rounded-lg border border-slate-300 px-3 py-2">
                {(Object.keys(t.idType) as Array<keyof typeof t.idType>).map((value) => (
                  <option key={value} value={value}>
                    {t.idType[value]}
                  </option>
                ))}
              </select>
            </div>
            <Field label={t.renters.fieldIdNumber} name="idNumber" />
            <Field label={t.renters.fieldVatNumber} name="vatNumber" />
            <Field label={t.renters.fieldPhone} name="phone" />
            <Field label={t.renters.fieldEmail} name="email" type="email" />
            <div className="md:col-span-2">
              <Field label={t.renters.fieldAddress} name="address" />
            </div>
            <div className="md:col-span-3">
              <button className="bg-brand-gold hover:bg-brand-gold-dark text-brand-black rounded-lg px-5 py-2.5 font-semibold">
                {t.renters.save}
              </button>
            </div>
          </form>
        </details>
      )}

      {renters.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-8 text-center text-slate-400">
          {t.renters.empty}
        </div>
      ) : (
        <>
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-right">
                <tr>
                  <th className="px-5 py-3 font-medium">{t.renters.colName}</th>
                  <th className="px-5 py-3 font-medium">{t.renters.colIdType}</th>
                  <th className="px-5 py-3 font-medium">{t.renters.colIdNumber}</th>
                  <th className="px-5 py-3 font-medium">{t.renters.colVatNumber}</th>
                  <th className="px-5 py-3 font-medium">{t.renters.colContact}</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {renters.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3 font-medium text-slate-800">{pickLocalized(locale, r.fullNameAr, r.fullName)}</td>
                    <td className="px-5 py-3">{t.idType[r.idType]}</td>
                    <td className="px-5 py-3 text-slate-500">{r.idNumber ?? t.common.none}</td>
                    <td className="px-5 py-3">
                      <VatBadge renter={r} t={t} />
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      <ContactCell
                        renter={r}
                        t={t}
                        canViewMoveIns={canViewMoveIns}
                        canViewMoveOuts={canViewMoveOuts}
                        canViewCorporateHousing={canViewCorporateHousing}
                        canViewTenantPortalAccount={canViewTenantPortalAccount}
                        moveInByRenter={moveInByRenter}
                        moveOutByRenter={moveOutByRenter}
                        corporateAccountByRenter={corporateAccountByRenter}
                        contractByRenter={contractByRenter}
                      />
                    </td>
                    <td className="px-5 py-3 text-left">
                      {canDelete && <DeleteEntityButton id={r.id} action={deleteRenter} label={t.renters.delete} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {renters.map((r) => (
              <div key={r.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="font-semibold text-slate-800 break-words">{pickLocalized(locale, r.fullNameAr, r.fullName)}</div>
                  <VatBadge renter={r} t={t} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div>
                    <dt className="text-slate-400 text-xs">{t.renters.colIdType}</dt>
                    <dd className="text-slate-700">{t.idType[r.idType]}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400 text-xs">{t.renters.colIdNumber}</dt>
                    <dd className="text-slate-700 break-words">{r.idNumber ?? t.common.none}</dd>
                  </div>
                </dl>
                <div className="mt-2 text-sm text-slate-500">
                  <ContactCell
                    renter={r}
                    t={t}
                    canViewMoveIns={canViewMoveIns}
                    canViewMoveOuts={canViewMoveOuts}
                    canViewCorporateHousing={canViewCorporateHousing}
                    canViewTenantPortalAccount={canViewTenantPortalAccount}
                    moveInByRenter={moveInByRenter}
                    moveOutByRenter={moveOutByRenter}
                    corporateAccountByRenter={corporateAccountByRenter}
                    contractByRenter={contractByRenter}
                  />
                </div>
                {canDelete && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <DeleteEntityButton id={r.id} action={deleteRenter} label={t.renters.delete} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type RenterRow = Awaited<ReturnType<typeof listRenters>>[number];
type Dict = ReturnType<typeof getDictionary>;

function VatBadge({ renter, t }: { renter: RenterRow; t: Dict }) {
  return renter.vatNumber ? (
    <span className="px-2 py-1 rounded-full bg-brand-gold-tint text-brand-gold-dark text-xs font-medium">{renter.vatNumber}</span>
  ) : (
    <span className="text-slate-400 text-xs">{t.renters.individualBadge}</span>
  );
}

function ContactCell({
  renter,
  t,
  canViewMoveIns,
  canViewMoveOuts,
  canViewCorporateHousing,
  canViewTenantPortalAccount,
  moveInByRenter,
  moveOutByRenter,
  corporateAccountByRenter,
  contractByRenter,
}: {
  renter: RenterRow;
  t: Dict;
  canViewMoveIns: boolean;
  canViewMoveOuts: boolean;
  canViewCorporateHousing: boolean;
  canViewTenantPortalAccount: boolean;
  moveInByRenter: Awaited<ReturnType<typeof getMoveInStatusForRenters>>;
  moveOutByRenter: Awaited<ReturnType<typeof getMoveOutStatusForRenters>>;
  corporateAccountByRenter: Awaited<ReturnType<typeof getCorporateAccountLinksForRenters>>;
  contractByRenter: Awaited<ReturnType<typeof getContractLinksForRenters>>;
}) {
  const moveIn = moveInByRenter.get(renter.id);
  const moveOut = moveOutByRenter.get(renter.id);
  const corporateAccount = corporateAccountByRenter.get(renter.id);
  const contract = contractByRenter.get(renter.id);
  return (
    <>
      <div className="break-words">{renter.phone || renter.email || t.common.none}</div>
      {canViewMoveIns && moveIn && (
        <div className="mt-1">
          <Link href={`/operations/move-ins/${moveIn.moveInId}`} className="text-xs text-brand-gold-dark hover:underline">
            {t.moveIn.contractStatusLabel}: {t.moveInStatus[moveIn.status]}
          </Link>
        </div>
      )}
      {canViewMoveOuts && moveOut && (
        <div className="mt-1">
          <Link href={`/operations/move-outs/${moveOut.moveOutId}`} className="text-xs text-brand-gold-dark hover:underline">
            {t.moveOut.contractStatusLabel}: {t.moveOutStatus[moveOut.status]}
          </Link>
        </div>
      )}
      {canViewCorporateHousing && corporateAccount && (
        <div className="mt-1">
          <Link href={`/corporate-housing/accounts/${corporateAccount.accountId}`} className="text-xs text-brand-gold-dark hover:underline">
            {t.corporateHousing.renterIntegrationTitle}: {corporateAccount.accountNumber}
          </Link>
        </div>
      )}
      {canViewTenantPortalAccount && contract && (
        <div className="mt-1">
          <Link href={`/contracts/${contract.contractId}/edit`} className="text-xs text-brand-gold-dark hover:underline">
            {t.tenantPortal.sectionPortalAccess}
          </Link>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  name,
  required,
  type = "text",
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-gold"
      />
    </div>
  );
}
