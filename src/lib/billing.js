export function createBillingClientId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `billing-client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeBillingClient(record) {
    const emails = Array.isArray(record?.emails) ? record.emails : [];
    const phones = Array.isArray(record?.phones) ? record.phones : [];
    const invoiceMonths = record?.invoiceMonths && typeof record.invoiceMonths === 'object' ? record.invoiceMonths : {};

    return {
        emails: [String(emails[0] || ''), String(emails[1] || '')],
        phones: [
            { number: String(phones[0]?.number || ''), name: String(phones[0]?.name || '') },
            { number: String(phones[1]?.number || ''), name: String(phones[1]?.name || '') },
        ],
        billingDetails: String(record?.billingDetails || ''),
        contractSignedAt: String(record?.contractSignedAt || ''),
        cooperationStartedAt: String(record?.cooperationStartedAt || ''),
        invoiceDayOfMonth: Number(record?.invoiceDayOfMonth) || 10,
        contractFilePath: String(record?.contractFilePath || ''),
        acceptanceProtocolFilePath: String(record?.acceptanceProtocolFilePath || ''),
        camerasInstalled: Number(record?.camerasInstalled) || 0,
        courtsTotal: Number(record?.courtsTotal) || 0,
        invoiceMonths,
    };
}

export function mapBillingClientToRow(client) {
    const { id, clubId, clubName, ...rest } = client;
    return {
        id,
        club_id: clubId,
        club_name: clubName || '',
        payload: normalizeBillingClient(rest),
    };
}

export function mapRowToBillingClient(row) {
    return {
        id: row.id,
        clubId: row.club_id,
        clubName: row.club_name || '',
        ...normalizeBillingClient(row.payload || {}),
    };
}

const CONTRACT_TERM_MONTHS = 12;

export function getContractMonthProgress(contractSignedAt, now = new Date()) {
    const signed = new Date(String(contractSignedAt || ''));
    if (Number.isNaN(signed.getTime())) {
        return null;
    }

    const monthsElapsed = (now.getFullYear() - signed.getFullYear()) * 12 + (now.getMonth() - signed.getMonth());
    const current = Math.max(1, monthsElapsed + 1);

    return {
        current,
        total: CONTRACT_TERM_MONTHS,
        isNearingEnd: current >= CONTRACT_TERM_MONTHS - 2,
    };
}

function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

export function buildInvoiceMonths(cooperationStartedAt, invoiceDayOfMonth, invoiceMonths, now = new Date()) {
    const start = new Date(String(cooperationStartedAt || ''));
    if (Number.isNaN(start.getTime())) {
        return [];
    }

    const day = Math.min(Math.max(Number(invoiceDayOfMonth) || 1, 1), 31);
    const months = [];

    let year = start.getFullYear();
    let month = start.getMonth() + 1;
    const endYear = now.getFullYear();
    const endMonth = now.getMonth() + 1;

    while (year < endYear || (year === endYear && month <= endMonth)) {
        const key = `${year}-${String(month).padStart(2, '0')}`;
        const dueDate = new Date(year, month - 1, Math.min(day, getDaysInMonth(year, month)));
        const sent = Boolean(invoiceMonths?.[key]?.sent);

        months.push({
            key,
            year,
            month,
            label: String(month).padStart(2, '0'),
            dueDate,
            sent,
            status: sent ? 'sent' : (dueDate.getTime() < now.getTime() ? 'overdue' : 'pending'),
        });

        month += 1;
        if (month > 12) {
            month = 1;
            year += 1;
        }
    }

    return months;
}
