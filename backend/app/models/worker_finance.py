from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


PayoutMethodType = Literal["ECOCASH", "BANK"]


class PayoutMethodCreateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method_type: PayoutMethodType
    account_holder_name: str = Field(min_length=2, max_length=120)
    mobile_number: Optional[str] = Field(default=None, min_length=7, max_length=32)
    bank_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    account_number: Optional[str] = Field(default=None, min_length=4, max_length=64)
    branch_name: Optional[str] = Field(default=None, max_length=120)
    branch_code: Optional[str] = Field(default=None, max_length=40)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    make_default: bool = True

    @field_validator("account_holder_name", "mobile_number", "bank_name", "account_number", "branch_name", "branch_code", mode="before")
    @classmethod
    def strip_text(cls, value):
        if value is None:
            return None
        cleaned = " ".join(str(value).strip().split())
        return cleaned or None

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: str) -> str:
        return value.strip().upper()

    @model_validator(mode="after")
    def validate_method_fields(self):
        if self.method_type == "ECOCASH":
            if not self.mobile_number:
                raise ValueError("EcoCash mobile number is required.")
            if self.bank_name or self.account_number or self.branch_name or self.branch_code:
                raise ValueError("Bank fields are not accepted for an EcoCash payout method.")
        else:
            if not self.bank_name or not self.account_number:
                raise ValueError("Bank name and account number are required.")
            if self.mobile_number:
                raise ValueError("Mobile number is not accepted for a bank payout method.")
        return self


class PayoutMethodUpdateBody(BaseModel):
    """Partial payout method edit.

    The method type is intentionally immutable. Secret destination fields are optional so
    a worker can edit safe metadata without re-entering an EcoCash or bank account number.
    """

    model_config = ConfigDict(extra="forbid")

    account_holder_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    mobile_number: Optional[str] = Field(default=None, min_length=7, max_length=32)
    bank_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    account_number: Optional[str] = Field(default=None, min_length=4, max_length=64)
    branch_name: Optional[str] = Field(default=None, max_length=120)
    branch_code: Optional[str] = Field(default=None, max_length=40)
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    make_default: bool = False

    @field_validator("account_holder_name", "mobile_number", "bank_name", "account_number", "branch_name", "branch_code", mode="before")
    @classmethod
    def strip_text(cls, value):
        if value is None:
            return None
        cleaned = " ".join(str(value).strip().split())
        return cleaned or None

    @field_validator("currency")
    @classmethod
    def normalize_currency(cls, value: Optional[str]) -> Optional[str]:
        return value.strip().upper() if value else value

    @model_validator(mode="after")
    def require_a_change(self):
        editable_fields = self.model_fields_set - {"make_default"}
        if not editable_fields and not self.make_default:
            raise ValueError("No payout method changes were provided.")
        return self


class PayoutMethodDefaultBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    method_id: str = Field(min_length=8, max_length=100)
