import { listStaffUsers } from "@/lib/actions/staff-users";
import { getCurrentUserRole, requireSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getLocale, getDictionary } from "@/lib/i18n";
import { StaffUserCreateForm } from "@/components/staff-user-create-form";
import { StaffUserRow } from "@/components/staff-user-row";

export default async function StaffUsersPage() {
  const [users, role, session, locale] = await Promise.all([listStaffUsers(), getCurrentUserRole(), requireSession(), getLocale()]);
  const t = getDictionary(locale);

  const canCreate = can("staffUser.create", role);
  const canUpdateRole = can("staffUser.updateRole", role);
  const canActivate = can("staffUser.activate", role);
  const canDeactivate = can("staffUser.deactivate", role);
  const canResetPassword = can("staffUser.resetPassword", role);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t.staffUsers.title}</h1>
        <p className="text-slate-500 text-sm mt-1">{t.staffUsers.subtitle}</p>
      </div>

      {canCreate && (
        <StaffUserCreateForm
          t={{
            createTitle: t.staffUsers.createTitle,
            fieldName: t.staffUsers.fieldName,
            fieldEmail: t.staffUsers.fieldEmail,
            fieldRole: t.staffUsers.fieldRole,
            createSubmit: t.staffUsers.createSubmit,
            temporaryPasswordTitle: t.staffUsers.temporaryPasswordTitle,
            temporaryPasswordNotice: t.staffUsers.temporaryPasswordNotice,
          }}
          roleLabels={t.roles}
        />
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-500 uppercase">
              <th className="py-2 px-3">{t.staffUsers.colName}</th>
              <th className="py-2 px-3">{t.staffUsers.colEmail}</th>
              <th className="py-2 px-3">{t.staffUsers.colRole}</th>
              <th className="py-2 px-3">{t.staffUsers.colStatus}</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <StaffUserRow
                key={u.id}
                user={u}
                isSelf={u.id === session.user.id}
                roleLabels={t.roles}
                perms={{ canUpdateRole, canActivate, canDeactivate, canResetPassword }}
                t={{
                  statusActive: t.staffUsers.statusActive,
                  statusInactive: t.staffUsers.statusInactive,
                  activate: t.staffUsers.activate,
                  deactivate: t.staffUsers.deactivate,
                  resetPassword: t.staffUsers.resetPassword,
                  temporaryPasswordTitle: t.staffUsers.temporaryPasswordTitle,
                  temporaryPasswordNotice: t.staffUsers.temporaryPasswordNotice,
                  you: t.staffUsers.you,
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
