-- Run using psql as an administrator AFTER service migrations.
-- Supply distinct passwords using psql variables scaler_password and balancer_password.
CREATE ROLE stornx_scaler LOGIN PASSWORD :'scaler_password';
CREATE ROLE stornx_balancer LOGIN PASSWORD :'balancer_password';
REVOKE ALL ON SCHEMA optiscaler, optibalancer FROM PUBLIC;
GRANT USAGE ON SCHEMA optiscaler TO stornx_scaler;
GRANT USAGE ON SCHEMA optibalancer TO stornx_balancer;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA optiscaler TO stornx_scaler;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA optibalancer TO stornx_balancer;
REVOKE INSERT, UPDATE ON optiscaler.schema_version FROM stornx_scaler;
REVOKE INSERT, UPDATE ON optibalancer.schema_version FROM stornx_balancer;
-- Runtime users cannot create tables, delete audit records, or read the other journal.
