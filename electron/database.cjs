const Database = require('better-sqlite3');

const RESOURCE_TYPES = new Set([
  'proxy',
  'gift_card',
  'slynumber',
  'google_voice',
  'whatsapp',
  'linkedin_account',
]);

class ResourceDatabase {
  constructor(filePath) {
    this.db = new Database(filePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrateResourcesTypeConstraint();
    this.createSchema();
    this.db.pragma('user_version = 2');
  }

  migrateResourcesTypeConstraint() {
    const table = this.db.prepare(`
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = 'resources'
    `).get();

    if (!table || String(table.sql || '').includes("'linkedin_account'")) return;

    this.db.pragma('foreign_keys = OFF');

    try {
      const migrate = this.db.transaction(() => {
        this.db.exec(`
          DROP TABLE IF EXISTS resources_new;

          CREATE TABLE resources_new (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL CHECK(type IN (
              'proxy',
              'gift_card',
              'slynumber',
              'google_voice',
              'whatsapp',
              'linkedin_account'
            )),
            label TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active'
              CHECK(status IN ('active','inactive','expired','archived')),
            expires_at TEXT,
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );

          INSERT INTO resources_new (
            id, type, label, status, expires_at, notes, created_at, updated_at
          )
          SELECT
            id, type, label, status, expires_at, notes, created_at, updated_at
          FROM resources;

          DROP TABLE resources;
          ALTER TABLE resources_new RENAME TO resources;
        `);
      });

      migrate();
    } finally {
      this.db.pragma('foreign_keys = ON');
    }

    const violations = this.db.pragma('foreign_key_check');
    if (violations.length > 0) {
      throw new Error('Database migration completed with foreign-key errors.');
    }
  }

  createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN (
          'proxy',
          'gift_card',
          'slynumber',
          'google_voice',
          'whatsapp',
          'linkedin_account'
        )),
        label TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active'
          CHECK(status IN ('active','inactive','expired','archived')),
        expires_at TEXT,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS proxy_details (
        resource_id TEXT PRIMARY KEY,
        ip_address TEXT NOT NULL,
        country TEXT NOT NULL DEFAULT '',
        proxy_type TEXT NOT NULL DEFAULT '',
        port INTEGER,
        username_secret TEXT,
        password_secret TEXT,
        order_number TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(resource_id) REFERENCES resources(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS gift_card_details (
        resource_id TEXT PRIMARY KEY,
        issuer TEXT NOT NULL DEFAULT '',
        card_last4 TEXT NOT NULL DEFAULT '',
        card_number_secret TEXT,
        uid_secret TEXT,
        deposit_amount_cents INTEGER NOT NULL DEFAULT 0
          CHECK(deposit_amount_cents >= 0),
        current_amount_cents INTEGER NOT NULL DEFAULT 0
          CHECK(current_amount_cents >= 0),
        FOREIGN KEY(resource_id) REFERENCES resources(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS phone_details (
        resource_id TEXT PRIMARY KEY,
        phone_number_secret TEXT NOT NULL,
        phone_last4 TEXT NOT NULL DEFAULT '',
        related_email TEXT NOT NULL DEFAULT '',
        contact_name TEXT NOT NULL DEFAULT '',
        used_services TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(resource_id) REFERENCES resources(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS linkedin_account_details (
        resource_id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL DEFAULT '',
        last_name TEXT NOT NULL DEFAULT '',
        dob_secret TEXT,
        street_address_secret TEXT,
        county TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT '',
        zip_code TEXT NOT NULL DEFAULT '',
        ssn_last4 TEXT NOT NULL DEFAULT '',
        ssn_secret TEXT,
        driver_license_secret TEXT,
        driver_license_state TEXT NOT NULL DEFAULT '',
        linkedin_url TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        password_secret TEXT,
        FOREIGN KEY(resource_id) REFERENCES resources(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS linkedin_employment_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resource_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        job_title TEXT NOT NULL DEFAULT '',
        company TEXT NOT NULL DEFAULT '',
        employment_type TEXT NOT NULL DEFAULT '',
        start_date TEXT,
        end_date TEXT,
        is_current INTEGER NOT NULL DEFAULT 0 CHECK(is_current IN (0, 1)),
        FOREIGN KEY(resource_id) REFERENCES resources(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS linkedin_education (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resource_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        school TEXT NOT NULL DEFAULT '',
        degree TEXT NOT NULL DEFAULT '',
        start_year INTEGER,
        end_year INTEGER,
        location TEXT NOT NULL DEFAULT '',
        FOREIGN KEY(resource_id) REFERENCES resources(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type);
      CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);
      CREATE INDEX IF NOT EXISTS idx_resources_expires ON resources(expires_at);
      CREATE INDEX IF NOT EXISTS idx_proxy_country ON proxy_details(country);
      CREATE INDEX IF NOT EXISTS idx_phone_email ON phone_details(related_email);
      CREATE INDEX IF NOT EXISTS idx_linkedin_email ON linkedin_account_details(email);
      CREATE INDEX IF NOT EXISTS idx_linkedin_name
        ON linkedin_account_details(last_name, first_name);
      CREATE INDEX IF NOT EXISTS idx_linkedin_employment_resource
        ON linkedin_employment_history(resource_id, sort_order);
      CREATE INDEX IF NOT EXISTS idx_linkedin_education_resource
        ON linkedin_education(resource_id, sort_order);
    `);
  }

  getDashboard() {
    const totals = this.db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE
          WHEN expires_at IS NOT NULL AND date(expires_at) < date('now')
          THEN 1 ELSE 0 END
        ) AS expired,
        SUM(CASE
          WHEN expires_at IS NOT NULL
            AND date(expires_at) BETWEEN date('now') AND date('now', '+30 days')
          THEN 1 ELSE 0 END
        ) AS expiring30
      FROM resources
    `).get();

    const giftBalance = this.db.prepare(`
      SELECT COALESCE(SUM(current_amount_cents), 0) AS cents
      FROM gift_card_details
    `).get();

    const byTypeRows = this.db.prepare(`
      SELECT type, COUNT(*) AS count
      FROM resources
      GROUP BY type
    `).all();

    const upcoming = this.db.prepare(`
      SELECT id, type, label, status, expires_at AS expiresAt
      FROM resources
      WHERE expires_at IS NOT NULL
        AND date(expires_at) >= date('now')
      ORDER BY date(expires_at) ASC
      LIMIT 6
    `).all();

    return {
      total: Number(totals.total || 0),
      active: Number(totals.active || 0),
      expired: Number(totals.expired || 0),
      expiring30: Number(totals.expiring30 || 0),
      giftBalanceCents: Number(giftBalance.cents || 0),
      byType: Object.fromEntries(
        byTypeRows.map((row) => [row.type, Number(row.count)]),
      ),
      upcoming,
    };
  }

  listResources(filters = {}) {
    const where = [];
    const params = {};

    if (filters.type && RESOURCE_TYPES.has(filters.type)) {
      where.push('r.type = @type');
      params.type = filters.type;
    }

    if (filters.status && filters.status !== 'all') {
      where.push('r.status = @status');
      params.status = filters.status;
    }

    if (filters.search && String(filters.search).trim()) {
      where.push(`(
        r.label LIKE @search OR
        r.notes LIKE @search OR
        p.ip_address LIKE @search OR
        p.country LIKE @search OR
        p.order_number LIKE @search OR
        g.issuer LIKE @search OR
        g.card_last4 LIKE @search OR
        ph.related_email LIKE @search OR
        ph.phone_last4 LIKE @search OR
        li.first_name LIKE @search OR
        li.last_name LIKE @search OR
        li.email LIKE @search OR
        li.linkedin_url LIKE @search OR
        EXISTS (
          SELECT 1
          FROM linkedin_employment_history leh
          WHERE leh.resource_id = r.id
            AND (
              leh.job_title LIKE @search OR
              leh.company LIKE @search OR
              leh.employment_type LIKE @search
            )
        ) OR
        EXISTS (
          SELECT 1
          FROM linkedin_education led
          WHERE led.resource_id = r.id
            AND (
              led.school LIKE @search OR
              led.degree LIKE @search OR
              led.location LIKE @search
            )
        )
      )`);
      params.search = `%${String(filters.search).trim()}%`;
    }

    const rows = this.db.prepare(`
      SELECT
        r.id,
        r.type,
        r.label,
        r.status,
        r.expires_at AS expiresAt,
        r.notes,
        r.created_at AS createdAt,
        r.updated_at AS updatedAt,
        p.ip_address AS ipAddress,
        p.country,
        p.proxy_type AS proxyType,
        p.port,
        p.order_number AS orderNumber,
        g.issuer,
        g.card_last4 AS cardLast4,
        g.deposit_amount_cents AS depositAmountCents,
        g.current_amount_cents AS currentAmountCents,
        ph.phone_last4 AS phoneLast4,
        ph.related_email AS relatedEmail,
        ph.contact_name AS contactName,
        ph.used_services AS usedServices,
        li.first_name AS firstName,
        li.last_name AS lastName,
        li.email AS linkedinEmail,
        li.linkedin_url AS linkedinUrl
      FROM resources r
      LEFT JOIN proxy_details p ON p.resource_id = r.id
      LEFT JOIN gift_card_details g ON g.resource_id = r.id
      LEFT JOIN phone_details ph ON ph.resource_id = r.id
      LEFT JOIN linkedin_account_details li ON li.resource_id = r.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY
        CASE WHEN r.status = 'active' THEN 0 ELSE 1 END,
        CASE WHEN r.expires_at IS NULL THEN 1 ELSE 0 END,
        date(r.expires_at) ASC,
        r.updated_at DESC
    `).all(params);

    return rows.map((row) => ({
      ...row,
      summary: this.makeSummary(row),
    }));
  }

  makeSummary(row) {
    if (row.type === 'proxy') {
      const endpoint = [row.ipAddress, row.port].filter(Boolean).join(':');
      return [row.country, row.proxyType, endpoint].filter(Boolean).join(' • ');
    }

    if (row.type === 'gift_card') {
      return [
        row.issuer || 'Gift card',
        row.cardLast4 ? `•••• ${row.cardLast4}` : null,
      ].filter(Boolean).join(' • ');
    }

    if (row.type === 'linkedin_account') {
      const fullName = [row.firstName, row.lastName].filter(Boolean).join(' ');
      return [fullName || 'LinkedIn account', row.linkedinEmail]
        .filter(Boolean)
        .join(' • ');
    }

    return [
      row.phoneLast4 ? `••• ••• ${row.phoneLast4}` : 'Phone number',
      row.relatedEmail,
    ].filter(Boolean).join(' • ');
  }

  getRawResource(id) {
    const base = this.db.prepare(`
      SELECT
        id,
        type,
        label,
        status,
        expires_at AS expiresAt,
        notes,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM resources
      WHERE id = ?
    `).get(id);

    if (!base) return null;

    if (base.type === 'proxy') {
      base.details = this.db.prepare(`
        SELECT
          ip_address AS ipAddress,
          country,
          proxy_type AS proxyType,
          port,
          username_secret AS usernameSecret,
          password_secret AS passwordSecret,
          order_number AS orderNumber
        FROM proxy_details
        WHERE resource_id = ?
      `).get(id) || {};
    } else if (base.type === 'gift_card') {
      base.details = this.db.prepare(`
        SELECT
          issuer,
          card_last4 AS cardLast4,
          card_number_secret AS cardNumberSecret,
          uid_secret AS uidSecret,
          deposit_amount_cents AS depositAmountCents,
          current_amount_cents AS currentAmountCents
        FROM gift_card_details
        WHERE resource_id = ?
      `).get(id) || {};
    } else if (base.type === 'linkedin_account') {
      const details = this.db.prepare(`
        SELECT
          first_name AS firstName,
          last_name AS lastName,
          dob_secret AS dobSecret,
          street_address_secret AS streetAddressSecret,
          county,
          city,
          state,
          zip_code AS zipCode,
          ssn_last4 AS ssnLast4,
          ssn_secret AS ssnSecret,
          driver_license_secret AS driverLicenseSecret,
          driver_license_state AS driverLicenseState,
          linkedin_url AS linkedinUrl,
          email,
          password_secret AS passwordSecret
        FROM linkedin_account_details
        WHERE resource_id = ?
      `).get(id) || {};

      details.employmentHistory = this.db.prepare(`
        SELECT
          job_title AS jobTitle,
          company,
          employment_type AS employmentType,
          COALESCE(start_date, '') AS startDate,
          COALESCE(end_date, '') AS endDate,
          is_current AS isCurrent
        FROM linkedin_employment_history
        WHERE resource_id = ?
        ORDER BY sort_order ASC, id ASC
      `).all(id).map((row) => ({
        ...row,
        isCurrent: Boolean(row.isCurrent),
      }));

      details.education = this.db.prepare(`
        SELECT
          school,
          degree,
          start_year AS startYear,
          end_year AS endYear,
          location
        FROM linkedin_education
        WHERE resource_id = ?
        ORDER BY sort_order ASC, id ASC
      `).all(id).map((row) => ({
        ...row,
        startYear: row.startYear ? String(row.startYear) : '',
        endYear: row.endYear ? String(row.endYear) : '',
      }));

      base.details = details;
    } else {
      base.details = this.db.prepare(`
        SELECT
          phone_number_secret AS phoneNumberSecret,
          phone_last4 AS phoneLast4,
          related_email AS relatedEmail,
          contact_name AS contactName,
          used_services AS usedServices
        FROM phone_details
        WHERE resource_id = ?
      `).get(id) || {};
    }

    return base;
  }

  saveResource(resource) {
    if (!resource || !RESOURCE_TYPES.has(resource.type)) {
      throw new Error('Invalid resource type.');
    }

    if (!resource.id || !String(resource.label || '').trim()) {
      throw new Error('Resource ID and label are required.');
    }

    const save = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO resources (
          id, type, label, status, expires_at, notes
        ) VALUES (
          @id, @type, @label, @status, @expiresAt, @notes
        )
        ON CONFLICT(id) DO UPDATE SET
          type = excluded.type,
          label = excluded.label,
          status = excluded.status,
          expires_at = excluded.expires_at,
          notes = excluded.notes,
          updated_at = CURRENT_TIMESTAMP
      `).run({
        id: resource.id,
        type: resource.type,
        label: String(resource.label).trim(),
        status: resource.status || 'active',
        expiresAt: resource.expiresAt || null,
        notes: resource.notes || '',
      });

      this.db.prepare(
        'DELETE FROM linkedin_employment_history WHERE resource_id = ?',
      ).run(resource.id);
      this.db.prepare(
        'DELETE FROM linkedin_education WHERE resource_id = ?',
      ).run(resource.id);
      this.db.prepare(
        'DELETE FROM linkedin_account_details WHERE resource_id = ?',
      ).run(resource.id);
      this.db.prepare(
        'DELETE FROM proxy_details WHERE resource_id = ?',
      ).run(resource.id);
      this.db.prepare(
        'DELETE FROM gift_card_details WHERE resource_id = ?',
      ).run(resource.id);
      this.db.prepare(
        'DELETE FROM phone_details WHERE resource_id = ?',
      ).run(resource.id);

      const d = resource.details || {};

      if (resource.type === 'proxy') {
        if (!String(d.ipAddress || '').trim()) {
          throw new Error('IP address is required.');
        }

        this.db.prepare(`
          INSERT INTO proxy_details (
            resource_id,
            ip_address,
            country,
            proxy_type,
            port,
            username_secret,
            password_secret,
            order_number
          ) VALUES (
            @resourceId,
            @ipAddress,
            @country,
            @proxyType,
            @port,
            @usernameSecret,
            @passwordSecret,
            @orderNumber
          )
        `).run({
          resourceId: resource.id,
          ipAddress: String(d.ipAddress).trim(),
          country: d.country || '',
          proxyType: d.proxyType || '',
          port: d.port ? Number(d.port) : null,
          usernameSecret: d.usernameSecret || null,
          passwordSecret: d.passwordSecret || null,
          orderNumber: d.orderNumber || '',
        });
      } else if (resource.type === 'gift_card') {
        this.db.prepare(`
          INSERT INTO gift_card_details (
            resource_id,
            issuer,
            card_last4,
            card_number_secret,
            uid_secret,
            deposit_amount_cents,
            current_amount_cents
          ) VALUES (
            @resourceId,
            @issuer,
            @cardLast4,
            @cardNumberSecret,
            @uidSecret,
            @depositAmountCents,
            @currentAmountCents
          )
        `).run({
          resourceId: resource.id,
          issuer: d.issuer || '',
          cardLast4: d.cardLast4 || '',
          cardNumberSecret: d.cardNumberSecret || null,
          uidSecret: d.uidSecret || null,
          depositAmountCents: Number(d.depositAmountCents || 0),
          currentAmountCents: Number(d.currentAmountCents || 0),
        });
      } else if (resource.type === 'linkedin_account') {
        const firstName = String(d.firstName || '').trim();
        const lastName = String(d.lastName || '').trim();
        const email = String(d.email || '').trim();

        if (!firstName || !lastName) {
          throw new Error('First name and last name are required.');
        }
        if (!email) {
          throw new Error('LinkedIn account email is required.');
        }

        this.db.prepare(`
          INSERT INTO linkedin_account_details (
            resource_id,
            first_name,
            last_name,
            dob_secret,
            street_address_secret,
            county,
            city,
            state,
            zip_code,
            ssn_last4,
            ssn_secret,
            driver_license_secret,
            driver_license_state,
            linkedin_url,
            email,
            password_secret
          ) VALUES (
            @resourceId,
            @firstName,
            @lastName,
            @dobSecret,
            @streetAddressSecret,
            @county,
            @city,
            @state,
            @zipCode,
            @ssnLast4,
            @ssnSecret,
            @driverLicenseSecret,
            @driverLicenseState,
            @linkedinUrl,
            @email,
            @passwordSecret
          )
        `).run({
          resourceId: resource.id,
          firstName,
          lastName,
          dobSecret: d.dobSecret || null,
          streetAddressSecret: d.streetAddressSecret || null,
          county: d.county || '',
          city: d.city || '',
          state: d.state || '',
          zipCode: d.zipCode || '',
          ssnLast4: d.ssnLast4 || '',
          ssnSecret: d.ssnSecret || null,
          driverLicenseSecret: d.driverLicenseSecret || null,
          driverLicenseState: d.driverLicenseState || '',
          linkedinUrl: d.linkedinUrl || '',
          email,
          passwordSecret: d.passwordSecret || null,
        });

        const employmentInsert = this.db.prepare(`
          INSERT INTO linkedin_employment_history (
            resource_id,
            sort_order,
            job_title,
            company,
            employment_type,
            start_date,
            end_date,
            is_current
          ) VALUES (
            @resourceId,
            @sortOrder,
            @jobTitle,
            @company,
            @employmentType,
            @startDate,
            @endDate,
            @isCurrent
          )
        `);

        const employmentHistory = Array.isArray(d.employmentHistory)
          ? d.employmentHistory
          : [];

        employmentHistory.forEach((entry, index) => {
          const item = entry && typeof entry === 'object' ? entry : {};
          const jobTitle = String(item.jobTitle || '').trim();
          const company = String(item.company || '').trim();

          if (!jobTitle && !company) return;

          employmentInsert.run({
            resourceId: resource.id,
            sortOrder: index,
            jobTitle,
            company,
            employmentType: String(item.employmentType || '').trim(),
            startDate: item.startDate || null,
            endDate: item.isCurrent ? null : item.endDate || null,
            isCurrent: item.isCurrent ? 1 : 0,
          });
        });

        const educationInsert = this.db.prepare(`
          INSERT INTO linkedin_education (
            resource_id,
            sort_order,
            school,
            degree,
            start_year,
            end_year,
            location
          ) VALUES (
            @resourceId,
            @sortOrder,
            @school,
            @degree,
            @startYear,
            @endYear,
            @location
          )
        `);

        const education = Array.isArray(d.education) ? d.education : [];

        education.forEach((entry, index) => {
          const item = entry && typeof entry === 'object' ? entry : {};
          const school = String(item.school || '').trim();
          const degree = String(item.degree || '').trim();

          if (!school && !degree) return;

          educationInsert.run({
            resourceId: resource.id,
            sortOrder: index,
            school,
            degree,
            startYear: item.startYear ? Number(item.startYear) : null,
            endYear: item.endYear ? Number(item.endYear) : null,
            location: String(item.location || '').trim(),
          });
        });
      } else {
        if (!d.phoneNumberSecret) {
          throw new Error('Phone number is required.');
        }

        this.db.prepare(`
          INSERT INTO phone_details (
            resource_id,
            phone_number_secret,
            phone_last4,
            related_email,
            contact_name,
            used_services
          ) VALUES (
            @resourceId,
            @phoneNumberSecret,
            @phoneLast4,
            @relatedEmail,
            @contactName,
            @usedServices
          )
        `).run({
          resourceId: resource.id,
          phoneNumberSecret: d.phoneNumberSecret,
          phoneLast4: d.phoneLast4 || '',
          relatedEmail: d.relatedEmail || '',
          contactName: d.contactName || '',
          usedServices: d.usedServices || '',
        });
      }
    });

    save();
    return this.getRawResource(resource.id);
  }

  deleteResource(id) {
    const result = this.db.prepare('DELETE FROM resources WHERE id = ?').run(id);
    return { deleted: result.changes > 0 };
  }

  close() {
    this.db.close();
  }
}

module.exports = { ResourceDatabase, RESOURCE_TYPES };