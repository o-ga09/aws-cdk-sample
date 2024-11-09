package usecase

import (
	"clean-serverless-book-sample/domain"
)

type IGetMicropostByID interface {
	Execute(req *GetMicropostByIDRequest) (*GetMicropostByIDResponse, error)
}

type GetMicropostByIDRequest struct {
	MicropostID uint64
	UserID      uint64
}

type GetMicropostByIDResponse struct {
	Micropost *domain.MicropostModel
}
